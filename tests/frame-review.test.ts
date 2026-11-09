import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewGroups, type FrameSignature } from '../lib/frame-review';

test('video suggestions require close durations and similarity at every sampled position', () => {
  const video = (
    id: string,
    colors: number[],
    duration: number,
    pixels: number,
  ): FrameSignature => ({
    id,
    duration,
    pixels,
    favorite: false,
    frames: colors.map((color) => ({
      colors: new Uint8ClampedArray([color, color, color, 255]),
      detail: 0,
    })),
  });
  const clips = [
    video('small', [30, 80, 140], 9, 1),
    video('large', [33, 79, 142], 9.1, 2),
    video('same-poster', [30, 250, 140], 9, 3),
    video('different-duration', [30, 80, 140], 12, 3),
  ];
  assert.deepEqual(
    reviewGroups(clips).map((group) => group.map(({ id }) => id)),
    [['large', 'small']],
  );
});
