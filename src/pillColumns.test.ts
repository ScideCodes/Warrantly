import test from 'node:test';
import assert from 'node:assert/strict';
import { pillColumns } from './pillColumns.ts';

test('pill rows are always full', () => {
  assert.equal(pillColumns(3, 340, 100, 8), 3); // side by side
  assert.equal(pillColumns(3, 340, 120, 8), 1); // too wide: stacked, never 2 + 1
  assert.equal(pillColumns(8, 340, 70, 8), 4);
  assert.equal(pillColumns(8, 340, 120, 8), 2);
  assert.equal(pillColumns(8, 340, 200, 8), 1);
  assert.equal(pillColumns(5, 600, 50, 8), 1); // 5 has no even split under 5 columns
  assert.equal(pillColumns(2, 340, 160, 8), 2);
});
