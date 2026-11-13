import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SourceLoader, sourceKey, type SourceState } from './formSource.ts';

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function recorder<T>() {
  const states: SourceState[] = [];
  const values: (T | null)[] = [];
  const loader = new SourceLoader<T>((state, value) => { states.push(state); values.push(value); });
  return { loader, states, values };
}

test('source keys tell edit, copy and a new warranty apart', () => {
  assert.equal(sourceKey('5', undefined), 'edit:5');
  assert.equal(sourceKey(undefined, '5'), 'copy:5');
  assert.equal(sourceKey('5', '7'), 'edit:5');
  assert.equal(sourceKey(undefined, undefined), null);
});

test('a new warranty is ready at once and never fetches', async () => {
  const { loader, states } = recorder<string>();
  await loader.load(null, async () => { throw new Error('fetched'); });
  assert.deepEqual(states, [{ key: null, status: 'ready' }]);
});

test('an existing record loads; a deleted one is reported missing, not left loading', async () => {
  const { loader, states, values } = recorder<string>();
  await loader.load('edit:1', async () => 'kettle');
  assert.deepEqual(states.at(-1), { key: 'edit:1', status: 'ready' });
  assert.equal(values.at(-1), 'kettle');
  await loader.load('copy:9', async () => null);
  assert.deepEqual(states.at(-1), { key: 'copy:9', status: 'missing' });
  assert.equal(values.at(-1), null);
});

test('a failed load reports the error, and Retry can still succeed', async () => {
  const { loader, states, values } = recorder<string>();
  await loader.load('edit:1', async () => { throw new Error('database is locked'); });
  assert.deepEqual(states.at(-1), { key: 'edit:1', status: 'failed', error: 'database is locked' });
  await loader.load('edit:1', async () => 'kettle');
  assert.deepEqual(states.slice(-2), [{ key: 'edit:1', status: 'loading' }, { key: 'edit:1', status: 'ready' }]);
  assert.equal(values.at(-1), 'kettle');
});

test('a slow earlier load cannot overwrite the newer route', async () => {
  const { loader, states, values } = recorder<string>();
  const slow = pending<string | null>();
  const first = loader.load('edit:1', () => slow.promise);
  await loader.load('edit:2', async () => 'second');
  slow.resolve('first');
  await first;
  assert.deepEqual(states.at(-1), { key: 'edit:2', status: 'ready' });
  assert.equal(values.at(-1), 'second');
  assert.ok(!values.includes('first'));
});

test('a late failure from a superseded load is ignored too', async () => {
  const { loader, states } = recorder<string>();
  const slow = pending<string | null>();
  const first = loader.load('edit:1', () => slow.promise);
  await loader.load('edit:1', async () => 'retried');
  slow.reject(new Error('timeout'));
  await first;
  assert.deepEqual(states.at(-1), { key: 'edit:1', status: 'ready' });
});

test('nothing is reported after the screen closes', async () => {
  const { loader, states } = recorder<string>();
  const slow = pending<string | null>();
  const loading = loader.load('edit:1', () => slow.promise);
  loader.cancel();
  slow.resolve('kettle');
  await loading;
  assert.deepEqual(states, [{ key: 'edit:1', status: 'loading' }]);
});
