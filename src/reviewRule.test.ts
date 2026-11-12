import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldAskReview } from './reviewRule.ts';

test('the rating prompt waits for real use and repeats at most every 120 days', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  assert.equal(shouldAskReview(9, 5, null, now), false);
  assert.equal(shouldAskReview(10, 2, null, now), false);
  assert.equal(shouldAskReview(10, 3, null, now), true);
  assert.equal(shouldAskReview(50, 9, '2026-08-01T10:00:00Z', now), false); // 103 days ago
  assert.equal(shouldAskReview(50, 9, '2026-07-01T10:00:00Z', now), true); // 134 days ago
});
