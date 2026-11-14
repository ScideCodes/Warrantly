import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IndexCancelled, readPdfText } from './pdfText.ts';

test('PDF search includes pages after page four and consumes each bounded batch', async () => {
  const seen: string[] = [];
  const result = await readPdfText(async (first, count) => {
    assert.equal(count, 2);
    assert.equal(seen.length, first);
    return { pageCount: 7, pages: Array.from({ length: Math.min(count, 7 - first) }, (_, i) => `${first + i}`) };
  }, async (uri) => { seen.push(uri); return [`serial-${uri}`]; }, () => false);
  assert.equal(seen.length, 7);
  assert.match(result, /serial-6/);
});

test('cancelling OCR stops before recognizing another page', async () => {
  let stopped = false;
  await assert.rejects(readPdfText(async () => ({ pageCount: 2, pages: ['a', 'b'] }), async () => {
    stopped = true; return ['text'];
  }, () => stopped), IndexCancelled);
});

test('a missing native page batch fails instead of looping forever', async () => {
  await assert.rejects(readPdfText(async () => ({ pageCount: 5, pages: [] }), async () => [], () => false), /Missing PDF pages/);
});
