import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { encodePin, lockoutSeconds, pinLength, pinMatches, promptClosedBy, QUICK_CANCEL_MS, sha256, shouldRelock } from './pin.ts';

test('sha256 matches node:crypto, across block boundaries and UTF-8', () => {
  for (const s of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(200), 'jótállás ő ű 🔒']) {
    assert.equal(sha256(s), createHash('sha256').update(s, 'utf8').digest('hex'), `len ${s.length}`);
  }
});

test('PIN encode and check', () => {
  const stored = encodePin('4821', 'c0ffee');
  assert.equal(stored.split(':').length, 3);
  assert.ok(!stored.includes('4821'));
  assert.equal(pinLength(stored), 4);
  assert.ok(pinMatches('4821', stored));
  assert.ok(!pinMatches('4822', stored));
  assert.ok(!pinMatches('48210', stored));
  assert.notEqual(encodePin('4821', 'beef'), stored); // salted
});

test('lockout and relock timing', () => {
  assert.deepEqual([0, 4, 5, 6, 7, 20].map(lockoutSeconds), [0, 0, 30, 60, 120, 3600]);
  assert.equal(shouldRelock(null, 1e9), false);
  assert.equal(shouldRelock(0, 3 * 60_000), false);
  assert.equal(shouldRelock(0, 3 * 60_000 + 1), true);
});

test('who closed the fingerprint prompt', () => {
  const by = (error: string, warning: string | undefined, ms: number) => promptClosedBy({ error, warning }, 'Use PIN', ms);
  assert.equal(by('user_cancel', 'Use PIN', 100), 'person'); // the "Use PIN" button, however fast
  assert.equal(by('user_cancel', 'Authentication canceled', 100), 'system'); // too fast for a person
  assert.equal(by('user_cancel', 'Authentication canceled', QUICK_CANCEL_MS), 'person'); // Back
  assert.equal(by('user_cancel', undefined, 2000), 'person');
  assert.equal(by('lockout', 'Too many attempts', 50), 'person');
  assert.equal(by('not_available', undefined, 50), 'person');
  assert.equal(by('system_cancel', undefined, 3000), 'system');
  assert.equal(by('app_cancel', undefined, 10), 'system');
});
