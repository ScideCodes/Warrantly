import test from 'node:test';
import assert from 'node:assert/strict';
import { imageMime, mailUrl, telUrl, webUrl } from './safeLinks.ts';

test('only web, mail and phone links are opened', () => {
  assert.equal(webUrl('shop.hu/garancia'), 'https://shop.hu/garancia');
  assert.equal(webUrl('https://shop.hu'), 'https://shop.hu/');
  assert.equal(webUrl('javascript:alert(1)'), null);
  assert.equal(webUrl('intent://scan/#Intent;scheme=zxing;end'), null);
  assert.equal(webUrl('file:///data/data/x'), null);
  assert.equal(webUrl('localhost'), null);
  assert.equal(mailUrl('help@shop.hu'), 'mailto:help@shop.hu');
  assert.equal(mailUrl('a@b.hu?cc=evil@x.com'), null);
  assert.equal(telUrl('+36 1 234 5678'), 'tel:+3612345678');
  assert.equal(telUrl('call me'), null);
});

test('declared image types are kept only when plain', () => {
  assert.equal(imageMime('image/png'), 'image/png');
  assert.equal(imageMime('image/png" onerror="x'), 'image/jpeg');
  assert.equal(imageMime('text/html'), 'image/jpeg');
  assert.equal(imageMime(null), 'image/jpeg');
});
