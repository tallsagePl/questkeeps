import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placePhotoSize } from '../lib/place-photo-size';
test('landscape fills the frame; portrait keeps at least 70% without distortion', () => {
  assert.deepEqual(placePhotoSize(440, 260, 1600, 900), {
    width: 440,
    height: 260,
  });
  const portrait = placePhotoSize(440, 260, 900, 1600);
  assert.ok(Math.abs(260 / portrait.height - 0.7) < 0.0001);
  assert.ok(portrait.width < 440);
  assert.equal(portrait.width / portrait.height, 900 / 1600);
  const narrow = placePhotoSize(100, 300, 900, 1600);
  assert.equal(narrow.width, 100);
  assert.ok(narrow.height < 300);
});
