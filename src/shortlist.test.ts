import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completeness } from './completeness.ts';
import { duplicatePairs } from './duplicates.ts';
import { quickFilter, sortWarranties, splitPinned, summary } from './listView.ts';
import { liveRecent, parseRecent, pushRecent } from './recent.ts';
import { reminderPlan } from './warranty.ts';

const item = (id: number, o: Partial<{ product_name: string | null; end_date: string; created_at: string; price: number | null; currency: string | null; doc_count: number; favorite: number }> = {}) => ({
  id, product_name: `P${id}`, end_date: '2027-01-01', created_at: `2026-01-0${id}`, price: null, currency: null, doc_count: 1, favorite: 0, ...o,
});

test('sort: expiry, newest added, name without accents, price grouped by currency with missing last; ties by id', () => {
  const list = [
    item(1, { end_date: '2027-05-01', product_name: 'Óra', price: 10, currency: 'EUR' }),
    item(2, { end_date: '2026-12-01', product_name: 'alma', price: 50000, currency: 'HUF' }),
    item(3, { end_date: '2027-05-01', product_name: 'Bor', price: null }),
    item(4, { end_date: '2026-12-01', product_name: 'alma', price: 99, currency: 'EUR' }),
  ];
  assert.deepEqual(sortWarranties(list, 'expiry').map((w) => w.id), [2, 4, 3, 1]);
  assert.deepEqual(sortWarranties(list, 'added').map((w) => w.id), [4, 3, 2, 1]);
  assert.deepEqual(sortWarranties(list, 'name').map((w) => w.id), [2, 4, 3, 1]);
  assert.deepEqual(sortWarranties(list, 'price').map((w) => w.id), [4, 1, 2, 3]); // EUR 99, EUR 10, HUF, no price
});

test('quick filters and summary use the same 30-day window', () => {
  const today = '2026-11-13';
  const list = [
    item(1, { end_date: '2026-11-13' }), // today: still covered, expiring
    item(2, { end_date: '2026-12-13', doc_count: 0 }), // day 30
    item(3, { end_date: '2026-12-14' }), // day 31
    item(4, { end_date: '2026-11-12', doc_count: 0 }), // expired: not in the counts
  ];
  assert.deepEqual(quickFilter(list, 'expiring', today).map((w) => w.id), [1, 2]);
  assert.deepEqual(quickFilter(list, 'nodocs', today).map((w) => w.id), [2, 4]);
  assert.deepEqual(summary(list, today), { covered: 3, expiring: 2, noDocs: 1 });
});

test('pinned: shown once at the top while covered; expired pins stay with the expired', () => {
  const { pinned, rest } = splitPinned([item(1, { favorite: 1 }), item(2), item(3, { favorite: 1, end_date: '2020-01-01' })], '2026-11-13');
  assert.deepEqual([pinned.map((w) => w.id), rest.map((w) => w.id)], [[1], [2, 3]]);
});

const w = (id: number, o: Record<string, unknown> = {}) => ({
  id, product_name: 'Bosch Serie 6 WAU28PH9BY', store_name: 'eMAG', purchase_date: '2026-03-01', order_number: null as string | null, serial_number: null as string | null,
  coverage: null as string | null, bundle_id: null as number | null, status: 'complete', ...o,
});

test('duplicates: name with store or close dates; order or serial alone; never different covers, bundles, dismissed', () => {
  const list = [
    w(1),
    w(2, { product_name: 'Bosch Serie 6 WAU28PH9BY mosógép, 9 kg', store_name: 'eMAG.hu', purchase_date: '2026-03-04' }), // name + date
    w(3, { product_name: 'Totally different', order_number: 'AB-1234', store_name: 'X' }),
    w(4, { product_name: 'Other thing', order_number: 'ab1234', store_name: 'Y', purchase_date: '2025-01-01' }), // order matches 3
    w(5, { coverage: 'extended' }), // extended plan beside 1: not a duplicate
    w(6, { product_name: 'Bosch Serie 6 WAU28PH9BY', store_name: 'Other shop', purchase_date: '2024-01-01' }), // same name only
  ];
  const pairs = duplicatePairs(list, new Set());
  assert.deepEqual(pairs.map((p) => [p.a.id, p.b.id, p.reasons]), [[1, 2, ['name', 'date']], [3, 4, ['order']]]);
  assert.deepEqual(duplicatePairs(list, new Set(['1:2'])).map((p) => [p.a.id, p.b.id]), [[3, 4]]);
  assert.deepEqual(duplicatePairs([w(1, { bundle_id: 7 }), w(2, { bundle_id: 7 })], new Set()), []);
});

test('completeness: needed vs suggested, with the fix to offer', () => {
  const base = { length_is_suggested: 0, start_is_suggested: 0, serial_number: 'SN1', status: 'complete' };
  assert.deepEqual(completeness(base, [{ label: 'receipt' }]), []);
  assert.deepEqual(completeness({ ...base, serial_number: null, length_is_suggested: 1 }, []).map((i) => [i.key, i.level, i.fix]), [
    ['no_document', 'needed', 'attach'], ['length_unconfirmed', 'needed', 'edit'], ['no_serial', 'suggested', 'serial'],
  ]);
  assert.deepEqual(completeness(base, [{ label: 'other' }]).map((i) => i.key), ['no_receipt_label']);
});

test('recently opened: newest first, once each, at most 8; gone targets drop; junk is ignored', () => {
  let list = parseRecent(null);
  for (let i = 1; i <= 10; i++) list = pushRecent(list, { kind: 'warranty', id: i, at: String(i) });
  list = pushRecent(list, { kind: 'warranty', id: 5, at: 'x' });
  assert.deepEqual(list.map((e) => e.id), [5, 10, 9, 8, 7, 6, 4, 3]);
  list = pushRecent(list, { kind: 'document', id: 1, warrantyId: 3, at: 'y' });
  // 8 entries: warranty 3 fell off the end when the document was opened.
  assert.deepEqual(liveRecent(list, new Set([3, 4, 10]), new Set([1])).map((e) => `${e.kind}${e.id}`), ['document1', 'warranty10', 'warranty4']);
  assert.deepEqual(parseRecent('{"bad":1}'), []);
  assert.deepEqual(parseRecent('not json'), []);
});

test('reminder plan: custom dates added once, only for listed warranties, past ones dropped', () => {
  const plan = reminderPlan([{ id: 1, end_date: '2027-03-01' }], '2026-11-13', 60, [30], [
    { warrantyId: 1, date: '2027-01-15' }, { warrantyId: 1, date: '2027-01-30' }, // the 30-day one is the same day: sent once
    { warrantyId: 1, date: '2026-01-01' }, { warrantyId: 2, date: '2027-01-01' },
  ]);
  assert.deepEqual(plan.map((r) => [r.kind, r.date]), [['custom', '2027-01-15'], ['expiry', '2027-01-30']]);
});
