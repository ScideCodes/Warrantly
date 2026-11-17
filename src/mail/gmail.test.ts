import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseEmail } from '../parser/parse.ts';
import { gmailProvider, parseAddress, SEARCH_QUERY, toMailMessage, type GmailApiMessage } from './gmail.ts';
import { decodeEntities, htmlToText } from './htmlToText.ts';
import { fetchAndParse } from './provider.ts';

const html = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const b64url = (s: string, enc: 'utf8' | 'latin1' = 'utf8') => Buffer.from(s, enc).toString('base64url');

// Real HTML bodies (anonymized) must parse the same way the connector's plain text did. These are
// order confirmations: PCX states a warranty length per item, so it counts; the others are skipped,
// but their line items must still be found.
const htmlCases = [
  { file: 'alza-order.html', from: 'segito@alza.hu', subject: 'Már dolgozunk rajta. / 1060000001 sz. megr.',
    expect: { orderNumber: '1060000001', items: [{ name: 'Mixing Desk FIFINE SC3', warrantyMonths: null, warrantySource: null }], status: 'ignored' } },
  { file: 'pcx-order.html', from: 'pcx@pcx.hu', subject: 'Rendelés',
    expect: { orderNumber: '260901/900001', items: [{ name: 'Gembird MA-DA1-05 asztali tartó konzol', warrantyMonths: 24, warrantySource: 'email' }], status: 'complete' } },
  { file: 'atk-order.html', from: 'cs@atkgear.com', subject: 'Order #ATKGR00001 confirmed',
    expect: { orderNumber: 'ATKGR00001', items: [{ name: 'ATK Blazing Sky ZERO Ultralight Wireless Gaming Mouse', warrantyMonths: null, warrantySource: null }], status: 'ignored' } },
];

for (const c of htmlCases) {
  test(`real HTML parses: ${c.file}`, () => {
    const msg = { id: c.file, from: c.from, to: ['user@example.com'], subject: c.subject, date: '2026-09-12T07:00:40Z', text: htmlToText(html(c.file)), attachments: [] };
    const result = parseEmail(msg) as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(c.expect)) assert.deepEqual(result[key], value, key);
  });
}

test('htmlToText drops head, style and comments, keeps cells and line breaks', () => {
  const text = htmlToText('<head><title>x</title><style>td{}</style></head><!-- c --><p>Hi&nbsp;there<br>you</p><table><tr><td>A</td><td>B</td></tr></table>');
  assert.equal(text, 'Hi there\nyou\n\nA | B |');
});

test('decodeEntities handles named Hungarian letters and numeric codes', () => {
  assert.equal(decodeEntities('&eacute;p&iacute;t&eacute;s &#337;r &#x171; &odblac; &bogus;'), 'építés őr ű ő &bogus;');
});

test('parseAddress', () => {
  assert.deepEqual(parseAddress('"Alza.hu" <Segito@Alza.hu>'), { name: 'Alza.hu', address: 'segito@alza.hu' });
  assert.deepEqual(parseAddress('pcx@pcx.hu'), { name: '', address: 'pcx@pcx.hu' });
});

const apiMessage: GmailApiMessage = {
  id: 'm1',
  internalDate: String(Date.UTC(2026, 8, 12, 7, 0, 40)),
  payload: {
    mimeType: 'multipart/mixed',
    headers: [
      { name: 'From', value: 'PCX Webáruház <pcx@pcx.hu>' },
      { name: 'To', value: 'Teszt Elek <user@example.com>' },
      { name: 'Subject', value: 'Jótállási jegy' },
    ],
    parts: [
      { mimeType: 'multipart/alternative', parts: [
        { mimeType: 'text/plain', body: { data: b64url('flattened plain text') } },
        // Latin-2 shop mail: "ő" is byte 0xF5 in iso-8859-2.
        { mimeType: 'text/html', headers: [{ name: 'Content-Type', value: 'text/html; charset="iso-8859-2"' }],
          body: { data: Buffer.from('<table><tr><td>Azonosító: 1</td><td>Asztali tartó 24 hó gar.</td></tr></table><p>Köszönjük, rendelésed: ' + '\xf5' + '</p>', 'latin1').toString('base64url') } },
      ] },
      { mimeType: 'application/pdf', filename: 'szamla.pdf', body: { attachmentId: 'att1', size: 1000 } },
    ],
  },
};

test('toMailMessage prefers HTML, decodes charset, lists attachments', () => {
  const m = toMailMessage(apiMessage);
  assert.equal(m.from, 'pcx@pcx.hu');
  assert.equal(m.fromName, 'PCX Webáruház');
  assert.deepEqual(m.to, ['user@example.com']);
  assert.equal(m.date, '2026-09-12T07:00:40.000Z');
  assert.ok(m.text.includes('Asztali tartó 24 hó gar.'), m.text);
  assert.ok(m.text.endsWith('ő'), 'iso-8859-2 decoded');
  assert.deepEqual(m.attachments, [{ filename: 'szamla.pdf', mimeType: 'application/pdf', id: 'att1' }]);
});

test('gmailProvider pages the search, then fetchAndParse parses each message', async () => {
  const calls: string[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push(url);
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer tok');
    const body = url.includes('messages?')
      ? url.includes('pageToken=p2') ? { messages: [{ id: 'm1' }] } : { messages: [], nextPageToken: 'p2' }
      : apiMessage;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;

  const { results, failed } = await fetchAndParse(gmailProvider(async () => 'tok', fakeFetch), new Date(Date.UTC(2026, 0, 1)));
  assert.deepEqual(failed, []);
  assert.equal(calls.length, 3);
  assert.ok(decodeURIComponent(calls[0]).includes(`${SEARCH_QUERY} after:1767225600`), calls[0]);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'complete');
  assert.deepEqual(results[0].items.map((i) => [i.name, i.warrantyMonths]), [['Asztali tartó', 24]]);
});

test('gmailProvider reports permanent errors at once and retries rate limits', async () => {
  let calls = 0;
  const body = { error: { code: 403, message: 'Gmail API has not been used in project 1', errors: [{ reason: 'accessNotConfigured' }] } };
  const always403 = (async () => (calls++, new Response(JSON.stringify(body), { status: 403 }))) as unknown as typeof fetch;
  await assert.rejects(gmailProvider(async () => 'tok', always403, 0).getMessage('m1'), /Gmail 403 on messages\/m1: accessNotConfigured - Gmail API has not been used/);
  assert.equal(calls, 1); // accessNotConfigured will not fix itself

  const htmlBody = (async () => new Response('<html>nope</html>', { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(gmailProvider(async () => 'tok', htmlBody, 0).getMessage('m1'), /Gmail 401 on messages\/m1: <html>nope<\/html>/);

  let n = 0;
  const flaky = (async () => (n++ === 0 ? new Response('{}', { status: 429 }) : new Response(JSON.stringify(apiMessage), { status: 200 }))) as unknown as typeof fetch;
  assert.equal((await gmailProvider(async () => 'tok', flaky, 0).getMessage('m1')).id, 'm1');

  const quota = { error: { code: 403, message: 'Quota exceeded', errors: [{ reason: 'rateLimitExceeded' }] } };
  let q = 0;
  const limited = (async () => (q++ < 2 ? new Response(JSON.stringify(quota), { status: 403 }) : new Response(JSON.stringify(apiMessage), { status: 200 }))) as unknown as typeof fetch;
  assert.equal((await gmailProvider(async () => 'tok', limited, 0).getMessage('m1')).id, 'm1');
  assert.equal(q, 3);
});

test('gmailProvider refreshes an expired token once', async () => {
  const seen: (string | undefined)[] = [];
  const getToken = async (expired?: string) => (seen.push(expired), expired ? 'fresh' : 'stale');
  const fakeFetch = (async (_url: string, init: RequestInit) =>
    (init.headers as Record<string, string>).Authorization === 'Bearer fresh'
      ? new Response(JSON.stringify(apiMessage), { status: 200 })
      : new Response('{}', { status: 401 })) as unknown as typeof fetch;
  assert.equal((await gmailProvider(getToken, fakeFetch, 0).getMessage('m1')).id, 'm1');
  assert.deepEqual(seen, [undefined, 'stale']);
  const always401 = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(gmailProvider(getToken, always401, 0).getMessage('m1'), /Gmail 401/);
});

test('fetchAndParse skips a mail that cannot be fetched and keeps going', async () => {
  const provider = {
    listMessageIds: async () => ['bad', 'good'],
    getMessage: async (id: string) => {
      if (id === 'bad') throw new Error('Gmail 403 on messages/bad');
      return toMailMessage(apiMessage);
    },
    getAttachment: async () => new Uint8Array(),
  };
  const progress: number[][] = [];
  const { results, failed } = await fetchAndParse(provider, null, { onProgress: (done, total) => progress.push([done, total]) });
  assert.deepEqual(progress, [[0, 2], [1, 2]]);
  assert.deepEqual(failed, [{ id: 'bad', error: 'Gmail 403 on messages/bad' }]);
  assert.equal(results.length, 1);
});

// ReDoS guards: each 50 KB input made an old regex backtrack for seconds to minutes.
const hostile = (unit: string) => unit.repeat(Math.ceil(50_000 / unit.length));
function assertFast(label: string, run: () => unknown) {
  const start = performance.now();
  run();
  const ms = performance.now() - start;
  assert.ok(ms < 200, `${label} took ${ms.toFixed(0)} ms`);
}

test('htmlToText stays linear on unclosed tags and comments', () => {
  assert.equal(htmlToText('a<!-- never closed <p>b</p>'), 'a');
  assert.equal(htmlToText('<p class="x">a < b</p>'), 'a < b');
  assertFast('open tags', () => htmlToText(hostile('<')));
  assertFast('open block tags', () => htmlToText(hostile('<p')));
  assertFast('open comments', () => htmlToText(hostile('<!--')));
  assertFast('open styles', () => htmlToText(hostile('<style>')));
});
