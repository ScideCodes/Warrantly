import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decode, encode } from 'fast-png';
import { maskBetween, privatePdfHtml, redactPng } from './redaction.ts';

test('redaction overwrites pixels and alpha, preserves outside pixels, and strips metadata', () => {
  const input = encode({ width: 10, height: 10, depth: 8, channels: 4, data: new Uint8Array(400).fill(180), text: { secret: 'private customer name' } });
  const output = decode(redactPng(input, [{ x: .4, y: .4, width: .2, height: .2 }]));
  assert.deepEqual(Array.from(output.data.slice((4 * 10 + 4) * 4, (4 * 10 + 4) * 4 + 4)), [0, 0, 0, 255]);
  assert.deepEqual(Array.from(output.data.slice(0, 4)), [180, 180, 180, 180]);
  assert.deepEqual(output.text, {});
  assert.equal(decode(input).data[176], 180); // original bytes are unchanged
});
test('drag direction and out-of-bounds touches produce the same normalized mask', () => {
  assert.deepEqual(maskBetween(.8, .9, .2, .3), maskBetween(.2, .3, .8, .9));
  assert.deepEqual(maskBetween(-1, -1, 2, 2), { x: 0, y: 0, width: 1, height: 1 });
});
test('private export accepts only encoded pixels and rejects invalid masks', () => {
  assert.throws(() => privatePdfHtml(['<script>secret</script>']));
  assert.throws(() => privatePdfHtml([]));
  const input = encode({ width: 2, height: 2, channels: 3, data: new Uint8Array(12).fill(255) });
  assert.throws(() => redactPng(input, [{ x: NaN, y: 0, width: 1, height: 1 }]));
  const html = privatePdfHtml([Buffer.from(redactPng(input, [{ x: 0, y: 0, width: 1, height: 1 }])).toString('base64')]);
  assert.match(html, /data:image\/png;base64,/);
  assert.doesNotMatch(html, /application\/pdf|private customer name/);
});
