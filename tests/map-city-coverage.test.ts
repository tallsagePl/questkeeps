import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.DATABASE_PATH =
  './data/map-city-coverage-' + randomUUID() + '.sqlite';

const { db, run, one } = await import('../lib/db');

const { discoverPhotoRegion } = await import('../lib/map-area-suggestions');

const { photoSearchRegions, PHOTO_SEARCH_RADIUS_METERS } =
  await import('../lib/photo-search-regions');

const regionAt = (lat: number, lon: number) =>
  photoSearchRegions([{ lat, lon }])[0];

const { photoInArea } = await import('../lib/area-membership');

after(() => db.close());

const street = (id: number, nodes: number[], geometry: any[]) => ({
  type: 'way',
  id,
  nodes,
  geometry,
  tags: { name: 'Old town street', highway: 'residential' },
});

const first = street(
  101,
  [1, 2],
  [
    { lat: 36.884, lon: 30.705 },
    { lat: 36.885, lon: 30.705 },
  ],
);

const second = street(
  102,
  [2, 3],
  [
    { lat: 36.885, lon: 30.705 },
    { lat: 36.887, lon: 30.705 },
  ],
);

const district = {
  type: 'relation',
  id: 103,
  tags: {
    name: 'Old town',
    type: 'boundary',
    boundary: 'administrative',
    admin_level: '8',
  },
  members: [
    {
      type: 'way',
      ref: 104,
      role: 'outer',
      geometry: [
        { lat: 36.88, lon: 30.7 },
        { lat: 36.89, lon: 30.7 },
        { lat: 36.89, lon: 30.71 },
        { lat: 36.88, lon: 30.71 },
        { lat: 36.88, lon: 30.7 },
      ],
    },
  ],
};

test('photo-centred lookup covers Antalya old town, refreshes truncated streets and replaces city cache', async () => {
  const lat = 36.90812;
  const lon = 30.69556;
  const region = regionAt(36.886, 30.705);
  run(
    'INSERT INTO map_area_city_cache VALUES (?,?,?)',
    'v2:' + lat + ',' + lon,
    '[]',
    Date.now(),
  );
  run(
    'INSERT INTO map_areas VALUES (?,?,?,?,?,?,?,?,?)',
    'osm-way-101',
    'Old town street',
    'street',
    '',
    'https://www.openstreetmap.org/way/101',
    lat,
    lon,
    JSON.stringify({ type: 'FeatureCollection', features: [] }),
    Date.now(),
  );
  const original = global.fetch;
  const requests: { url: string; query: string; method: string }[] = [];
  global.fetch = (async (input: any, init: any) => {
    requests.push({
      url: String(input),
      query: init.body.get('data'),
      method: init.method,
    });
    return new Response(
      JSON.stringify({ elements: [first, second, district] }),
    );
  }) as typeof fetch;
  try {
    const result = await discoverPhotoRegion(region);
    assert.equal(result.incomplete, false);
    assert.deepEqual(result.ids, ['osm-way-101', 'osm-relation-103']);
    assert.equal(requests.length, 1);
    const query = requests[0].query;
    assert.equal(requests[0].method, 'POST');
    assert.ok(
      query.includes(
        '(around:' +
          PHOTO_SEARCH_RADIUS_METERS +
          ',' +
          region.lat +
          ',' +
          region.lon +
          ')',
      ),
    );
    assert.ok(query.includes('out geom;'));
    assert.ok(query.includes('is_in(' + region.lat + ',' + region.lon + ')'));
    assert.ok(query.includes('rel(pivot.containing)'));
    assert.ok(
      !query.includes('36.90812,30.69556'),
      'lookup no longer uses the city centre',
    );
    // Public test fixture is south of every tile used by the former search.
    const photo = { lat: 36.886, lon: 30.705 };
    assert.ok(photo.lat < Math.round(lat * 100) / 100 - 0.016);
    for (const id of result.ids) {
      const geometry = JSON.parse(
        one('SELECT geometry FROM map_areas WHERE id=?', id)!.geometry,
      );
      assert.ok(
        photoInArea(photo, geometry),
        id + ' should match the old town fixture',
      );
    }
    const saved = JSON.parse(
      one('SELECT geometry FROM map_areas WHERE id=?', 'osm-way-101')!.geometry,
    );
    assert.equal(
      saved.features.length,
      2,
      'fresh but truncated street is rebuilt from every connected segment',
    );
    await discoverPhotoRegion(region);
    assert.equal(requests.length, 1, 'complete photo-cell lookup is reused');
    assert.ok(
      one('SELECT key FROM map_area_city_cache WHERE key=?', region.key),
    );
  } finally {
    global.fetch = original;
  }
});

test('incomplete boundary geometry remains retryable instead of being cached for a day', async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = (async () => {
    calls++;
    return new Response(
      JSON.stringify({
        elements:
          calls === 1
            ? [{ ...district, id: 203, members: [] }]
            : [{ ...district, id: 203 }],
      }),
    );
  }) as typeof fetch;
  try {
    const firstResult = await discoverPhotoRegion(regionAt(36.86, 30.63));
    assert.equal(firstResult.incomplete, true);
    assert.equal(
      one(
        'SELECT key FROM map_area_city_cache WHERE key=?',
        regionAt(36.86, 30.63).key,
      ),
      undefined,
    );
    const retry = await discoverPhotoRegion(regionAt(36.86, 30.63));
    assert.equal(retry.incomplete, false);
    assert.deepEqual(retry.ids, ['osm-relation-203']);
    assert.equal(calls, 2);
  } finally {
    global.fetch = original;
  }
});

test('new neighbouring cells retain every previously downloaded segment of a street', async () => {
  const original = global.fetch;
  global.fetch = (async () =>
    new Response(JSON.stringify({ elements: [first] }))) as typeof fetch;
  try {
    await discoverPhotoRegion(regionAt(36.888, 30.72));
    const geometry = JSON.parse(
      one('SELECT geometry FROM map_areas WHERE id=?', 'osm-way-101')!.geometry,
    );
    assert.ok(
      photoInArea({ lat: 36.886, lon: 30.705 }, geometry),
      'neighbour lookup must not trim the prior segment',
    );
  } finally {
    global.fetch = original;
  }
});

test('provider outages preserve stale public geometry but leave the result incomplete', async () => {
  const original = global.fetch;
  const key = regionAt(55.5991, 37.3552).key;
  run(
    'INSERT INTO map_area_city_cache VALUES (?,?,?)',
    key,
    JSON.stringify(['osm-way-101']),
    Date.now() - 2 * 86400000,
  );
  global.fetch = (async () =>
    new Response('', { status: 503 })) as typeof fetch;
  try {
    const result = await discoverPhotoRegion(regionAt(55.5991, 37.3552));
    assert.equal(result.incomplete, true);
    assert.deepEqual(result.ids, ['osm-way-101']);
    assert.ok(
      one('SELECT updated FROM map_area_city_cache WHERE key=?', key)!.updated <
        Date.now() - 86400000,
    );
  } finally {
    global.fetch = original;
  }
});

test('first cell lookup retains older city contours during a provider outage without marking coverage complete', async () => {
  const region = regionAt(36.87, 30.705);
  const { closestCity } = await import('../lib/city-lookup');
  const city = closestCity(region.lat, region.lon)!;
  const key = 'v3:' + city.lat + ',' + city.lon + ':40000';
  run(
    'INSERT OR REPLACE INTO map_area_city_cache VALUES (?,?,?)',
    key,
    JSON.stringify(['osm-relation-103']),
    Date.now(),
  );
  // Other outage test has already put both mocked providers into cooldown.
  const freshRegion = region;
  const result = await discoverPhotoRegion(freshRegion);
  assert.equal(result.incomplete, true);
  assert.deepEqual(result.ids, ['osm-relation-103']);
  assert.equal(
    one('SELECT key FROM map_area_city_cache WHERE key=?', freshRegion.key),
    undefined,
  );
});
