import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupPlacePhotos } from '../lib/place-photo-groups';
test('place photo groups are chronological and unique, exclude hidden, missing, video and inaccessible media, and honor the date range', () => {
  const media = [
    { id: 'later', kind: 'photo', taken: '2026-10-12T14:00:00' },
    { id: 'first', kind: 'photo', taken: '2026-10-10T10:00:00' },
    { id: 'hidden', kind: 'photo', taken: '2026-10-11', hidden: 1 },
    { id: 'missing', kind: 'photo', taken: '2026-10-11', missing: 1 },
    { id: 'video', kind: 'video', taken: '2026-10-11' },
    { id: 'other', kind: 'photo', taken: '2026-10-11' },
  ];
  const places = [
    'later',
    'first',
    'hidden',
    'missing',
    'video',
    'inaccessible',
    'first',
  ].map((media_id) => ({
    url: 'landmark',
    media_id,
    day: media_id === 'first' ? '2026-10-10' : '2026-10-12',
  }));
  places.push({ url: 'other-landmark', media_id: 'other', day: '2026-10-11' });
  assert.deepEqual(
    groupPlacePhotos(media, places, '')
      .get('landmark')!
      .map((p) => p.id),
    ['first', 'later'],
  );
  assert.deepEqual(
    groupPlacePhotos(media, places, '2026-10-11..2026-10-12')
      .get('landmark')!
      .map((p) => p.id),
    ['later'],
  );
  assert.equal(
    groupPlacePhotos(media, places, '2026-10-10').get('other-landmark'),
    undefined,
  );
});
