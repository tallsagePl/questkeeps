import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareablePhotos } from '../lib/share-cards';
import type { MediaItem } from '../lib/contracts';

test('publication selection never includes hidden, guest-hidden, missing or video frames', () => {
  const base = {
    id: 'public',
    favorite: 1,
    kind: 'photo',
    hidden: 0,
    hidden_from_guests: 0,
  } as MediaItem;
  const frames = [
    base,
    { ...base, id: 'ordinary', favorite: 0 },
    { ...base, id: 'hidden', hidden: 1 },
    { ...base, id: 'private', hidden_from_guests: 1 },
    { ...base, id: 'missing', missing: 1 },
    { ...base, id: 'clip', kind: 'video' },
  ];
  assert.deepEqual(
    shareablePhotos(frames).map((photo) => photo.id),
    ['public'],
  );
  assert.equal(frames.length, 6);
});
