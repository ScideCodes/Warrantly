import assert from 'node:assert/strict';
import { test } from 'node:test';
import { processPictureQueue } from './pictureQueue.ts';

test('existing library backfill reaches items beyond the former six-item limit and reports each success', async () => {
  const rows = Array.from({ length: 19 }, (_, i) => i);
  const visited: number[] = [], updated: number[] = [];
  const result = await processPictureQueue(rows, () => true, async (id) => { visited.push(id); return id % 2 === 0; }, (id) => updated.push(id));
  assert.deepEqual(visited, rows);
  assert.deepEqual(updated, rows.filter((id) => id % 2 === 0));
  assert.equal(result.changed, 10);
  assert.equal(result.error, null);
});

test('turning pictures off stops remaining lookups without losing an in-flight success', async () => {
  let enabled = true;
  const visited: number[] = [], updated: number[] = [];
  const result = await processPictureQueue([1, 2, 3], () => enabled, async (id) => { visited.push(id); enabled = false; return true; }, (id) => updated.push(id));
  assert.deepEqual(visited, [1]);
  assert.deepEqual(updated, [1]);
  assert.equal(result.changed, 1);
});

test('offline failures stop the pass while keeping completed image updates', async () => {
  const offline = new Error('offline');
  const visited: number[] = [];
  const result = await processPictureQueue([1, 2, 3], () => true, async (id) => { visited.push(id); if (id === 2) throw offline; return true; }, () => {});
  assert.deepEqual(visited, [1, 2]);
  assert.equal(result.changed, 1);
  assert.equal(result.error, offline);
});
