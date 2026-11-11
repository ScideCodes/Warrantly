import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ago, daysUntil, endDate, urgency } from './warranty.ts';

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
