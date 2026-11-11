import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { findWarrantyMonths, parseEmail } from './parse.ts';
import type { MailMessage, StoreRules } from './types.ts';

// Real emails from the owner's inbox, anonymized (names, addresses, phone, order numbers, URLs).
const fixtures: { name: string; message: MailMessage; storeRules?: StoreRules; expect: Record<string, unknown> }[] =
  JSON.parse(readFileSync(new URL('./fixtures/emails.json', import.meta.url), 'utf8'));

for (const f of fixtures) {
  test(f.name, () => {
    const result = parseEmail(f.message, f.storeRules) as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(f.expect)) assert.deepEqual(result[key], value, key);
  });
}

test('warranty length formats', () => {
  assert.equal(findWarrantyMonths('Warranty: 2 years'), 24);
  assert.equal(findWarrantyMonths('18 months warranty included'), 18);
  assert.equal(findWarrantyMonths('A jótállás időtartama 3 év.'), 36);
  assert.equal(findWarrantyMonths('12 hónap garancia'), 12);
  assert.equal(findWarrantyMonths('30 napos pénzvisszafizetési garancia'), null);
  assert.equal(findWarrantyMonths('no length here'), null);
});

test('the purchase date is the calendar day on the phone, not in UTC', () => {
  const tz = process.env.TZ;
  process.env.TZ = 'Europe/Budapest';
  try {
    // 23:30 UTC is 00:30 the next day in Budapest.
    const msg: MailMessage = { id: 'm', from: 'shop@example.com', to: [], subject: 'Garancia', date: '2026-01-15T23:30:00Z', text: '', attachments: [] };
    assert.equal(parseEmail(msg).purchaseDate, '2026-01-16');
  } finally {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  }
});
