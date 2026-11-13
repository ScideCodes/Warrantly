import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bound, maxPdfScroll, zoomPosition } from './pdfViewport.ts';

test('pinch keeps the document point under the focal point', () => {
  const next = zoomPosition(1, 2, 0, 400, 120, 200, 360, 600, 2400);
  assert.deepEqual(next, { scale: 2, x: -120, y: 500 });
  assert.equal((120 - next.x) / next.scale, 120);
  assert.equal(next.y + 200 / next.scale, 600);
});
test('zooming out to fit resets horizontal pan and clamps the last page', () => {
  assert.deepEqual(zoomPosition(3, 1, -400, 2200, 180, 300, 360, 600, 2400), { scale: 1, x: 0, y: 1800 });
});
test('short documents never scroll into blank space', () => {
  assert.equal(maxPdfScroll(200, 600, 1), 0);
  assert.equal(maxPdfScroll(400, 600, 3), 200);
  assert.equal(bound(-20, 0, -100), 0);
});
test('zoom limits and off-center horizontal bounds are enforced', () => {
  assert.equal(zoomPosition(1, 10, 0, 0, 500, 0, 360, 600, 2400).scale, 3);
  assert.equal(zoomPosition(1, 3, 0, 0, 500, 0, 360, 600, 2400).x, -720);
  assert.equal(zoomPosition(2, 0.1, -100, 100, 180, 100, 360, 600, 2400).scale, 1);
});
