import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ago, daysUntil, endDate, formErrors, isValidYmd, shortName, urgency } from './warranty.ts';

test('endDate adds months and clamps to month end', () => {
  assert.equal(endDate('2026-09-12', 24), '2028-09-12');
  assert.equal(endDate('2026-01-31', 1), '2026-02-28');
  assert.equal(endDate('2027-01-31', 13), '2028-02-29'); // leap year
  assert.equal(endDate('2026-11-30', 3), '2027-02-28');
});

test('daysUntil counts calendar days across DST changes', () => {
  assert.equal(daysUntil('2026-11-12', '2026-11-11'), 1);
  assert.equal(daysUntil('2026-11-11', '2026-11-11'), 0);
  assert.equal(daysUntil('2026-10-01', '2026-11-11'), -41);
  assert.equal(daysUntil('2027-04-01', '2027-03-01'), 31); // spans the March clock change
});

test('urgency buckets', () => {
  assert.deepEqual([-1, 0, 30, 31, 90, 91].map(urgency), ['expired', 'soon', 'soon', 'warning', 'warning', 'ok']);
});

test('ago picks days, months or years', () => {
  assert.deepEqual(ago('2026-11-11', '2026-11-11'), { unit: 'days', count: 0 });
  assert.deepEqual(ago('2026-10-20', '2026-11-11'), { unit: 'days', count: 22 });
  assert.deepEqual(ago('2026-09-12', '2026-11-11'), { unit: 'months', count: 1 });
  assert.deepEqual(ago('2024-11-12', '2026-11-11'), { unit: 'years', count: 1 });
  assert.deepEqual(ago('2024-11-11', '2026-11-11'), { unit: 'years', count: 2 });
});

test('form validation', () => {
  const ok = { product_name: 'Kettle', store_name: 'Shop', purchase_date: '2026-11-01', warranty_start_date: '', warranty_months: '24' };
  assert.deepEqual(formErrors(ok), []);
  assert.deepEqual(formErrors({ ...ok, warranty_start_date: '2026-11-03' }), []);
  assert.deepEqual(formErrors({ product_name: ' ', store_name: '', purchase_date: '2026-02-30', warranty_start_date: 'x', warranty_months: '0' }), [
    'product_name', 'store_name', 'purchase_date', 'warranty_start_date', 'warranty_months',
  ]);
  assert.deepEqual(formErrors({ ...ok, warranty_start_date: '2026-10-01' }), ['warranty_start_date']); // before purchase
  assert.deepEqual(formErrors({ ...ok, warranty_months: '12.5' }), ['warranty_months']);
  assert.equal(isValidYmd('2028-02-29'), true);
});

test('shortName keeps the identifying part of shop product names', () => {
  assert.equal(shortName('Jonsbo D300 - fekete, 270°-Tempered Glass (D300 BLACK)'), 'Jonsbo D300');
  assert.equal(shortName('Gembird WM-55ST-04 fali tartó konzol (815987) 12+'), 'Gembird WM-55ST-04 fali tartó konzol');
  assert.equal(shortName('SAMSUNG hálózati töltő Type-C aljzat 25W, PD gyorstöltés, fekete'), 'SAMSUNG hálózati töltő Type-C aljzat 25W');
  assert.equal(shortName('VXE MAD R 8K optikai USB / vezeték nélküli gaming egér'), 'VXE MAD R 8K optikai USB');
  assert.equal(shortName('Deepcool SC790 PWM és RGB vezérlő hub (R-SC790)'), 'Deepcool SC790 PWM és RGB vezérlő hub');
  assert.equal(shortName('Samsung Galaxy S24'), 'Samsung Galaxy S24'); // trailing model number stays
  assert.equal(shortName('Monitor - 27"'), 'Monitor - 27"'); // one word left: keep the whole name
  assert.equal(shortName('ATK Blazing Sky ZERO Ultralight Wireless Gaming Mouse'), 'ATK Blazing Sky ZERO Ultralight Wireless Gaming Mouse');
});
