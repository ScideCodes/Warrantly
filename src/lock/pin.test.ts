import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { encodePin, lockoutSeconds, pinLength, pinMatches, sha256, shouldRelock } from './pin.ts';

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
