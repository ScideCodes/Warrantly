import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ago, daysUntil, endDate, filterWarranties, formErrors, isValidYmd, productIcon, reminderDays, reminderPlan, returnDeadline, shortName, totalValue, urgency, warrantyFacets, type ListFilter } from './warranty.ts';

test('filter facets count each warranty once, including manual and expired entries', () => {
  const facets = warrantyFacets([
    { account_id: 0, category: 'phones', store_name: 'Store A' },
    { account_id: 0, category: 'phones', store_name: 'Store B' },
    { account_id: 4, category: null, store_name: 'Store A' },
    { account_id: null, category: 'tools', store_name: 'Store A' },
  ]);
  assert.equal(facets.total, 4);
  assert.deepEqual([...facets.accounts], [[0, 2], [4, 1], ['manual', 1]]);
  assert.deepEqual([...facets.categories], [['phones', 2], ['tools', 1]]);
  assert.deepEqual([...facets.stores], [['Store A', 3], ['Store B', 1]]);
  assert.equal(warrantyFacets([]).total, 0);
});

test('ISO filtering keeps expiry today and the 30-day boundary, including across months', () => {
  const list = ['2026-12-14', '2026-12-15', '2027-01-14', '2027-01-15'].map((end_date) => ({
    product_name: 'Vízforraló', store_name: 'Shop', end_date, account_id: null,
  }));
  const base: ListFilter = { query: 'vizforralo', store: null, soon: true, account: 'all', tab: 'active' };
  assert.deepEqual(filterWarranties(list, base, '2026-12-15').map((w) => w.end_date), ['2026-12-15', '2027-01-14']);
  assert.equal(filterWarranties(list, { ...base, soon: false, query: '  ' }, '2026-12-15').length, 3);
  assert.equal(filterWarranties(list, { ...base, soon: false, tab: 'expired' }, '2026-12-15').length, 1);
});

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

test('shortName: at most 3 words, ending at the model code', () => {
  assert.equal(shortName('Jonsbo D300 - fekete, 270°-Tempered Glass (D300 BLACK)'), 'Jonsbo D300');
  assert.equal(shortName('Gembird WM-55ST-04 fali tartó konzol (815987) 12+'), 'Gembird WM-55ST-04');
  assert.equal(shortName('White Shark WS GH-2440W/G PARROT-W/G fehér-szürke gamer headset'), 'White Shark WS');
  assert.equal(shortName('VXE MAD R 8K optikai USB / vezeték nélküli gaming egér'), 'VXE MAD R');
  assert.equal(shortName('Deepcool SC790 PWM és RGB vezérlő hub (R-SC790)'), 'Deepcool SC790');
  assert.equal(shortName('Számítógépház Jonsbo TK-3 fekete'), 'Számítógépház Jonsbo TK-3');
  assert.equal(shortName('SAMSUNG hálózati töltő Type-C aljzat 25W, PD gyorstöltés'), 'SAMSUNG hálózati töltő'); // model too far in
  assert.equal(shortName('ATK Blazing Sky ZERO Ultralight Wireless Gaming Mouse'), 'ATK Blazing Sky'); // no model code
  assert.equal(shortName('Mixing Desk FIFINE SC3'), 'Mixing Desk FIFINE');
  assert.equal(shortName('Samsung Galaxy S24'), 'Samsung Galaxy S24');
  assert.equal(shortName('4K Ultra HD Gaming Monitor'), '4K Ultra HD');
  assert.equal(shortName('1. Apple iPhone 15 Pro'), 'Apple iPhone 15');
  assert.equal(shortName('1 db Sony WH-1000XM4 fejhallgató'), 'Sony WH-1000XM4');
});

test('reminderPlan: 90/60/30, weekly, expiry day; from today on; nearest first; capped', () => {
  const plan = reminderPlan([{ id: 1, end_date: '2027-03-01' }], '2026-11-11');
  assert.deepEqual(plan.map((r) => [r.date, r.daysLeft]), [
    ['2026-12-01', 90], ['2026-12-31', 60], ['2027-01-30', 30], ['2027-02-06', 23],
    ['2027-02-13', 16], ['2027-02-20', 9], ['2027-02-27', 2], ['2027-03-01', 0],
  ]);
  // Already inside the window: only what is still ahead. Today's stays in, or opening the app in the
  // morning would cancel the reminder due later that day.
  assert.deepEqual(reminderPlan([{ id: 2, end_date: '2026-11-20' }], '2026-11-11').map((r) => r.daysLeft), [9, 2, 0]);
  assert.deepEqual(reminderPlan([{ id: 3, end_date: '2026-11-13' }], '2026-11-11').map((r) => r.daysLeft), [2, 0]);
  assert.deepEqual(reminderPlan([{ id: 5, end_date: '2026-11-11' }], '2026-11-11').map((r) => r.daysLeft), [0]); // expiry day
  // A return window closing on 2026-11-25 is reminded 2 days before.
  const withReturn = reminderPlan([{ id: 6, end_date: '2028-11-11', return_by: '2026-11-25' }], '2026-11-11');
  assert.deepEqual(withReturn[0], { warrantyId: 6, kind: 'return', daysLeft: 2, date: '2026-11-23' });
  assert.equal(reminderPlan([{ id: 6, end_date: '2028-11-11', return_by: '2026-11-12' }], '2026-11-11')[0].kind, 'expiry'); // warning day already past
  assert.deepEqual(reminderPlan([{ id: 4, end_date: '2026-11-01' }], '2026-11-11'), []); // expired
  const many = Array.from({ length: 20 }, (_, i) => ({ id: i, end_date: '2027-01-01' }));
  const capped = reminderPlan(many, '2026-11-11', 60);
  assert.equal(capped.length, 60);
  assert.ok(capped.every((r, i) => i === 0 || capped[i - 1].date <= r.date));
});

test('filterWarranties: tab, account, store, expiring soon, accent-insensitive search', () => {
  const today = '2026-11-11';
  const list = [
    { id: 1, product_name: 'Philips vízforraló HD9350', store_name: 'MediaMarkt', end_date: '2026-11-30', account_id: null, category: 'appliances' },
    { id: 2, product_name: 'Gembird WM-55ST-04 fali tartó', store_name: 'PCX', end_date: '2028-01-01', account_id: 7 },
    { id: 3, product_name: null, store_name: 'Conrad HU', end_date: '2026-10-01', account_id: 7 },
  ];
  const base: ListFilter = { query: '', store: null, soon: false, account: 'all', tab: 'active' };
  const ids = (f: Partial<ListFilter>) => filterWarranties(list, { ...base, ...f }, today).map((w) => w.id);
  assert.deepEqual(ids({}), [1, 2]);
  assert.deepEqual(ids({ tab: 'expired' }), [3]);
  assert.deepEqual(ids({ query: 'vizforralo' }), [1]);
  assert.deepEqual(ids({ query: 'pcx tartó' }), [2]); // every word, product or store
  assert.deepEqual(ids({ soon: true }), [1]);
  assert.deepEqual(ids({ account: 7 }), [2]);
  assert.deepEqual(ids({ account: 'manual' }), [1]);
  assert.deepEqual(ids({ store: 'PCX' }), [2]);
  assert.deepEqual(ids({ tab: 'expired', query: 'conrad' }), [3]);
  assert.deepEqual(ids({ category: 'appliances' }), [1]);
});

test('returnDeadline: 14 days from delivery, mail (online) purchases only', () => {
  assert.equal(returnDeadline({ origin: 'gmail', warranty_start_date: '2026-11-11' }), '2026-11-25');
  assert.equal(returnDeadline({ origin: 'manual', warranty_start_date: '2026-11-11' }), null);
});

test('totalValue sums prices per currency and skips items without one', () => {
  assert.deepEqual(totalValue([
    { price: 6090, currency: 'HUF' }, { price: 37643, currency: 'HUF' }, { price: 49.9, currency: 'EUR' }, { price: null, currency: 'HUF' },
  ]), { HUF: 43733, EUR: 49.9 });
});

test('reminder groups: only the chosen ones are planned', () => {
  assert.deepEqual(reminderDays(['30', '0']), [30, 0]);
  const plan = reminderPlan([{ id: 1, end_date: '2027-03-01' }], '2026-11-11', 60, reminderDays(['weekly']));
  assert.deepEqual(plan.map((r) => r.daysLeft), [23, 16, 9, 2]);
});

test('productIcon picks by name, then category, then a parcel', () => {
  assert.equal(productIcon('Bosch Serie 6 mosógép', null), 'washing-machine');
  assert.equal(productIcon('Bosch dishwasher', 'appliances'), 'dishwasher');
  assert.equal(productIcon('Apple iPhone 15', null), 'cellphone');
  assert.equal(productIcon('Samsung Galaxy Tab S9', null), 'tablet');
  assert.equal(productIcon('LG OLED55 TV', null), 'television');
  assert.equal(productIcon('Mystery box', 'tools'), 'hammer-wrench');
  assert.equal(productIcon(null, null), 'package-variant-closed');
});

test('reminder summary joins day counts and names the rest', async () => {
  const { reminderSummary } = await import('./warranty.ts');
  const t = (key: string, o?: Record<string, unknown>) => (key === 'settings.daysBefore' ? `${o?.days} days` : key.replace('settings.groupShort_', ''));
  assert.equal(reminderSummary(['90', '60', '30', 'weekly', '0'], t), '90, 60, 30 days · weekly · 0');
  assert.equal(reminderSummary(['weekly'], t), 'weekly');
  assert.equal(reminderSummary([], t), '');
});
