import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  photoSearchRegions,
  PHOTO_SEARCH_RADIUS_METERS,
} from '../lib/photo-search-regions';

const distance = (
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) => {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((a.lat - b.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((a.lon - b.lon) * rad) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, h)));
};

test('every photo has a buffered search region, including remote points with no nearby city', () => {
  const points = [
    { lat: 36.886, lon: 30.705 },
    { lat: 36.8861, lon: 30.7051 },
    { lat: 41.01, lon: 28.98 },
    { lat: -54.2, lon: -70.5 },
    { lat: 0, lon: 179.9999 },
    { lat: 0, lon: -179.9999 },
    { lat: 89.9999, lon: 90 },
    { lat: -90, lon: 180 },
  ];
  const regions = photoSearchRegions(points);
  for (const point of points)
    assert.ok(
      regions.some(
        (r) => distance(point, r) < PHOTO_SEARCH_RADIUS_METERS - 300,
      ),
      'point must have at least 300 m of margin',
    );
  assert.ok(
    regions.every((r) =>
      points.some((p) => distance(p, r) < PHOTO_SEARCH_RADIUS_METERS),
    ),
    'no regions in empty space between cities',
  );
  assert.deepEqual(
    photoSearchRegions([...points].reverse()),
    regions,
    'order does not affect cells or cache keys',
  );
});

test('identical or nearby photos reuse cells; distant photos add only their own region', () => {
  const first = { lat: 36.886, lon: 30.705 };
  const cells = photoSearchRegions([
    first,
    first,
    { lat: 36.88601, lon: 30.70501 },
  ]);
  assert.equal(cells.length, 1);
  const expanded = photoSearchRegions([first, { lat: 0, lon: 0 }]);
  assert.equal(expanded.length, 2);
  assert.ok(expanded.some((r) => r.key === cells[0].key));
  assert.deepEqual(
    photoSearchRegions([
      { lat: NaN, lon: 2 },
      { lat: 91, lon: 0 },
      { lat: 0, lon: 181 },
    ]),
    [],
  );
});
