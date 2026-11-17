import test from 'node:test';
import assert from 'node:assert/strict';
import { serialCandidates, serialFromBarcode } from './serial.ts';

test('serial candidates prefer labelled values', () => {
  assert.deepEqual(serialCandidates(['Model: KD-55X85', 'S/N: 4012345ab', 'Made in EU'])[0], '4012345AB');
  assert.equal(serialCandidates(['Sorozatszám: XY99887766'])[0], 'XY99887766');
  assert.ok(serialCandidates(['MODEL KD-55X85J', 'R5CT123ABCD']).includes('R5CT123ABCD'));
  assert.deepEqual(serialCandidates(['hello world', '12345']), []); // no letters+digits code, no label
});

test('barcode payloads', () => {
  assert.equal(serialFromBarcode(' SN123456 '), 'SN123456');
  assert.equal(serialFromBarcode('https://example.com/x'), null);
  assert.equal(serialFromBarcode(''), null);
});

test('serial tokens stay linear on 50 KB hostile text', () => {
  assert.deepEqual(serialCandidates(['Model AB12-CD34 ok']), ['AB12-CD34']);
  for (const unit of ['-', '1-', 'A-']) {
    const start = performance.now();
    serialCandidates([unit.repeat(50_000 / unit.length)]);
    const ms = performance.now() - start;
    assert.ok(ms < 200, `${unit} run took ${ms.toFixed(0)} ms`);
  }
});
