import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shownPhoto } from './photo.ts';

test('own photo shows only while its file exists and has not failed to load', () => {
  const all = () => true;
  assert.equal(shownPhoto('photo-1.jpg', all, null), 'photo-1.jpg');
  assert.equal(shownPhoto(null, all, null), null); // no photo: category icon
  assert.equal(shownPhoto('photo-1.jpg', () => false, null), null); // file gone
  assert.equal(shownPhoto('photo-1.jpg', all, 'photo-1.jpg'), null); // corrupt: the load failed once
  assert.equal(shownPhoto('photo-2.jpg', all, 'photo-1.jpg'), 'photo-2.jpg'); // a new photo is tried again
});
