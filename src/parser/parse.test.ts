import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { findItems, findWarrantyMonths, parseEmail } from './parse.ts';
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

test('quantity markers use either x or multiplication sign without becoming part of the product', () => {
  for (const line of ['1 × Acme Kettle', '2x Acme Kettle', 'Acme Kettle x 2', 'Acme Kettle × 2']) {
    assert.deepEqual(findItems(line), [{ name: 'Acme Kettle', months: null }], line);
  }
  assert.deepEqual(findItems('Xbox Series X'), []);
  assert.deepEqual(findItems('1 × Shipping'), []);
});

test('email purchase date prefers explicit purchase date over sent date', () => {
  const msg: MailMessage = { id: 'dates', from: 'shop@example.com', to: [], subject: 'Warranty', date: '2026-11-10T12:00:00Z', text: 'Purchase date: October 21, 2026\n\n1 × Acme Kettle\n\n24 months warranty', attachments: [] };
  const result = parseEmail(msg);
  assert.equal(result.purchaseDate, '2026-10-21');
  assert.equal(result.items[0]?.name, 'Acme Kettle');
  assert.equal(result.status, 'complete');
});

test('table warranty cells stay attached to their own product', () => {
  const msg: MailMessage = { id: 'table', from: 'shop@example.com', to: [], subject: 'Warranty', date: '2026-11-10T12:00:00Z', text: 'Lenovo IdeaPad 5 | 24 months warranty | 500 EUR\nAcme Kettle | 12 months warranty | 30 EUR\n1 × Acme Mouse', attachments: [] };
  const result = parseEmail(msg);
  assert.deepEqual(result.items, [
    { name: 'Lenovo IdeaPad 5', warrantyMonths: 24, warrantySource: 'email' },
    { name: 'Acme Kettle', warrantyMonths: 12, warrantySource: 'email' },
    { name: 'Acme Mouse', warrantyMonths: null, warrantySource: null },
  ]);
  assert.equal(result.status, 'needs_input');
  assert.deepEqual(result.missingFields, ['warrantyMonths']);
});

test('delivery confirmation keeps its arrival date separate from the purchase date', () => {
  const result = parseEmail({ id: 'delivery', from: 'shop@example.com', to: [], subject: 'Warranty', date: '2026-11-10T12:00:00Z', text: 'Your order has been delivered.\nPurchase date: 2026-10-21\n\n1 × Acme Kettle\n\n24 months warranty', attachments: [] });
  assert.equal(result.purchaseDate, '2026-10-21');
  assert.equal(result.deliveredDate, '2026-11-10');
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

test('findItems captures multi-word products from quantity prefixes, numbers and labels', () => {
  assert.deepEqual(findItems('1 db Apple iPhone 15 Pro 128GB Fekete Titán 379 990 Ft'), [
    { name: 'Apple iPhone 15 Pro 128GB Fekete Titán', months: null },
  ]);
  assert.deepEqual(findItems('1. Logitech MX Master 3S vezeték nélküli egér'), [
    { name: 'Logitech MX Master 3S vezeték nélküli egér', months: null },
  ]);
  assert.deepEqual(findItems('Termék megnevezése: Sony WH-1000XM4 vezeték nélküli fejhallgató'), [
    { name: 'Sony WH-1000XM4 vezeték nélküli fejhallgató', months: null },
  ]);
});
