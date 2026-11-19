import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { encodePin, lockoutSeconds, pinLength, pinMatches, promptClosedBy, QUICK_CANCEL_MS, RELAUNCH_PASS_MS, relaunchPassValid, sha256, shouldRelock } from './pin.ts';

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
  const at = (wall: number, mono: number) => ({ wall, mono });
  const t0 = at(1e12, 5000);
  assert.equal(shouldRelock(null, at(2e12, 1e9)), false);
  assert.equal(shouldRelock(t0, at(1e12 + 3 * 60_000, 5000 + 3 * 60_000)), false);
  assert.equal(shouldRelock(t0, at(1e12 + 3 * 60_000 + 1, 5000 + 3 * 60_000 + 1)), true);
  assert.equal(shouldRelock(t0, at(1e12 + 1000, 5000 + 10 * 60_000)), true); // wall clock set back: monotonic still counts
  assert.equal(shouldRelock(t0, at(1e12 - 1, 5000 + 1000)), true); // wall clock went backwards
  assert.equal(shouldRelock(t0, at(1e12 + 10 * 60_000, 5000 + 1000)), true); // phone slept: monotonic paused, wall counts
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

test('relaunch pass: only inside its 30 seconds', () => {
  const now = 1e12;
  assert.equal(relaunchPassValid(now + RELAUNCH_PASS_MS, now), true);
  assert.equal(relaunchPassValid(now + 1, now), true);
  assert.equal(relaunchPassValid(now, now), false); // expired
  assert.equal(relaunchPassValid(0, now), false); // none written
  assert.equal(relaunchPassValid(now + RELAUNCH_PASS_MS + 1, now), false); // clock set back after it was written
});
