import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEmail } from '../parser/parse.ts';
import { decodeWords, mailToText, parseRfc822 } from './rfc822.ts';
import { parseScanText } from '../parser/scan.ts';

const pdf = Buffer.from('%PDF-1.4 test').toString('base64');
const eml = [
  'From: =?UTF-8?Q?Alza=2Ehu?= <segito@alza.hu>',
  'To: user@example.com',
  'Subject: =?UTF-8?B?UmVuZGVsw6lz?= =?UTF-8?Q?_visszaigazol=C3=A1s?=',
  'Date: Wed, 05 Nov 2026 10:15:00 +0100',
  'Message-ID: <abc123@alza.hu>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="outer"',
  '',
  'preamble',
  '--outer',
  'Content-Type: multipart/alternative; boundary=inner',
  '',
  '--inner',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'plain version',
  '--inner',
  'Content-Type: text/html; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  '<p>Rendel=C3=A9ssz=C3=A1m: 123456789</p><table><tr><td>Lenovo IdeaPad 5</td><td>24 h=',
  '=C3=B3nap garancia</td></tr></table>',
  '--inner--',
  '--outer',
  'Content-Type: application/pdf; name="szamla.pdf"',
  'Content-Disposition: attachment; filename="szamla.pdf"',
  'Content-Transfer-Encoding: base64',
  '',
  pdf,
  '--outer--',
  'epilogue text that is not the body',
].join('\r\n');

test('a shared .eml becomes a mail message with its PDF', () => {
  const { message, pdfs } = parseRfc822(new Uint8Array(Buffer.from(eml, 'latin1')), 'fallback');
  assert.equal(message.id, 'abc123@alza.hu');
  assert.equal(message.from, 'segito@alza.hu');
  assert.equal(message.fromName, 'Alza.hu');
  assert.equal(message.subject, 'Rendelés visszaigazolás');
  assert.equal(message.date, '2026-11-05T09:15:00.000Z');
  assert.match(message.text, /Rendelésszám: 123456789/); // HTML wins over plain, QP and soft breaks decoded
  assert.match(message.text, /24 hónap garancia/);
  assert.doesNotMatch(message.text, /epilogue/);
  assert.equal(pdfs.length, 1);
  assert.equal(pdfs[0].filename, 'szamla.pdf');
  assert.equal(Buffer.from(pdfs[0].bytes).toString(), '%PDF-1.4 test');
  const parsed = parseEmail(message);
  assert.equal(parsed.orderNumber, '123456789');
  assert.equal(parsed.storeDomain, 'alza.hu');
});

test('a plain single-part mail and broken headers do not throw', () => {
  const { message, pdfs } = parseRfc822(new Uint8Array(Buffer.from('Subject: Hi\n\nJust text', 'latin1')), 'f1');
  assert.equal(message.id, 'f1');
  assert.equal(message.text, 'Just text');
  assert.equal(pdfs.length, 0);
  assert.ok(!isNaN(Date.parse(message.date)));
  assert.doesNotThrow(() => parseRfc822(new Uint8Array([0, 255, 10, 10, 1]), 'f2'));
});

test('encoded words and form text', () => {
  assert.equal(decodeWords('=?iso-8859-2?Q?Sz=E1mla?= now'), 'Számla now');
  const text = mailToText({ id: '1', from: 'a@b.hu', fromName: 'Shop', to: [], subject: 'Order', date: '2026-11-05T09:15:00.000Z', text: 'body', attachments: [] });
  assert.equal(text, 'Shop\n2026-11-05\nOrder\nbody');
});

test('shared email autofill keeps product and purchase date from the body', () => {
  const raw = 'From: Acme Shop <support@acme.example>\nDate: Tue, 10 Nov 2026 12:00:00 +0000\nSubject: Warranty\nContent-Type: text/html; charset=utf-8\n\n<p>Purchase date: October 21, 2026</p><table><tr><td>Acme Kettle</td><td>24 months warranty</td></tr></table>';
  const { message } = parseRfc822(new TextEncoder().encode(raw), 'shared-test');
  const result = parseScanText(mailToText(message), '2026-11-11');
  assert.equal(result.productName, 'Acme Kettle');
  assert.equal(result.purchaseDate, '2026-10-21');
  assert.equal(result.warrantyMonths, 24);
  assert.equal(result.storeName, 'Acme Shop');
});
