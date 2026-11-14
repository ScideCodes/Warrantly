import assert from 'node:assert/strict';
import { test } from 'node:test';
import { segmentedLayout } from './segmentedLayout.ts';

test('backup frequencies reflow whole labels on a narrow phone', () => {
  for (const labels of [['Weekly', 'Monthly', '3 months', '6 months'], ['Hetente', 'Havonta', '3 havonta', '6 havonta']]) {
    assert.equal(segmentedLayout(296, 1, labels).columns, 2);
    assert.equal(segmentedLayout(296, 2, labels).columns, 1);
    assert.equal(segmentedLayout(640, 1, labels).columns, 4);
  }
});

test('appearance and language selectors reserve full labels at the chosen font scale', () => {
  assert.equal(segmentedLayout(296, 1, ['Light', 'Dark', 'Auto'], true).columns, 3);
  assert.equal(segmentedLayout(296, 1.6, ['System', 'English', 'Magyar'], true).columns, 1);
  assert.equal(segmentedLayout(296, 1, ['Világos', 'Sötét', 'Rendszer'], true).columns, 3);
});
