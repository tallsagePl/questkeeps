import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverLayout, clampPosition } from '../lib/cover-layout';

test('cover framing fills the frame, anchors its edges and handles quarter turns', () => {
  const top = coverLayout(600, 1200, 400, 200, 0, { x: 50, y: 0 });
  assert.equal(top.width, 400);
  assert.equal(top.height, 800);
  assert.equal(top.top, 400);
  const bottom = coverLayout(600, 1200, 400, 200, 0, { x: 50, y: 100 });
  assert.equal(bottom.top, -200);
  for (const rotation of [90, 270]) {
    const left = coverLayout(600, 1200, 400, 400, rotation, { x: 0, y: 50 });
    const right = coverLayout(600, 1200, 400, 400, rotation, { x: 100, y: 50 });
    assert.equal(left.height, 800);
    assert.equal(left.width, 400);
    assert.equal(left.left, 400);
    assert.equal(right.left, 0);
  }
  const center = coverLayout(1200, 600, 400, 200, 180, { x: 50, y: 50 });
  assert.equal(center.overflowX, 0);
  assert.equal(center.overflowY, 0);
  assert.equal(clampPosition(-20), 0);
  assert.equal(clampPosition(200), 100);
});
