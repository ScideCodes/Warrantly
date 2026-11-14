import test from 'node:test';
import assert from 'node:assert/strict';
import { backupHealth, type HealthInput } from './backupHealth.ts';

const base: HealthInput = { enabled: true, hasPassword: true, lastAt: '2026-11-10T10:00:00Z', error: null, errorAt: null, interval: 'weekly', pending: { changes: false, documents: 0 } };
const now = new Date('2026-11-13T10:00:00Z');

test('backup health states', () => {
  assert.equal(backupHealth({ ...base, enabled: false }, now).state, 'off');
  assert.equal(backupHealth({ ...base, hasPassword: false }, now).state, 'off');
  assert.deepEqual(backupHealth({ ...base, error: 'Drive full', errorAt: 'x' }, now), { state: 'failed', error: 'Drive full', at: 'x' });
  assert.equal(backupHealth({ ...base, lastAt: null }, now).state, 'never');
  assert.equal(backupHealth(base, now).state, 'ok');
  assert.deepEqual(backupHealth({ ...base, pending: { changes: true, documents: 2 } }, now), { state: 'pending', lastAt: base.lastAt, changes: true, documents: 2 });
  // weekly: 13 days is due but not twice over; 15 days is overdue
  assert.equal(backupHealth({ ...base, lastAt: '2026-10-31T10:00:00Z' }, now).state, 'ok');
  assert.equal(backupHealth({ ...base, lastAt: '2026-10-29T10:00:00Z' }, now).state, 'overdue');
});
