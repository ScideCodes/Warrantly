import assert from 'node:assert/strict';
import { test } from 'node:test';
import { showUpdateCard } from './updateCard.ts';

test('update card shows while an update waits, except on the day "Later" was tapped', () => {
  assert.equal(showUpdateCard(true, null, '2026-11-13'), true);
  assert.equal(showUpdateCard(false, null, '2026-11-13'), false); // nothing downloaded
  assert.equal(showUpdateCard(true, '2026-11-13', '2026-11-13'), false); // Later, same day
  assert.equal(showUpdateCard(true, '2026-11-12', '2026-11-13'), true); // next day
});
