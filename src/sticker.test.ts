import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stickerHtml, stickerId, stickerLink } from './sticker.ts';

test('a sticker link round-trips to its warranty id and nothing else matches', () => {
  assert.equal(stickerId(stickerLink(42)), 42);
  assert.equal(stickerId(' warrantly://warranty/7 '), 7);
  assert.equal(stickerId('https://example.com/warranty/7'), null);
  assert.equal(stickerId('warrantly://warranty/7/x'), null);
});

test('sticker html escapes the product name and carries a QR', () => {
  const html = stickerHtml(3, '<b>Kettle</b>', 'Ends 2027', 'Scan');
  assert.ok(html.includes('&#60;b&#62;Kettle'));
  assert.ok(html.includes('<svg'));
});
