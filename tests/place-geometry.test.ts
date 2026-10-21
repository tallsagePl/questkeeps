import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
process.env.DATABASE_PATH = './data/geometry-' + randomUUID() + '.sqlite';
const { geometryFromOsm } = await import('../lib/place-geometry');
const { db } = await import('../lib/db');
after(() => db.close());
test('street lines and district boundaries keep actual geometry and holes, incomplete rings are not fabricated', () => {
  const pt = (lon: number, lat: number) => ({ lon, lat });
  const result = geometryFromOsm(
    [
      {
        type: 'way',
        tags: { highway: 'pedestrian' },
        geometry: [pt(1, 1), pt(2, 2)],
      },
      {
        type: 'relation',
        tags: { type: 'boundary' },
        members: [
          { role: 'outer', geometry: [pt(0, 0), pt(4, 0), pt(4, 4)] },
          { role: 'outer', geometry: [pt(0, 0), pt(0, 4), pt(4, 4)] },
          { role: 'inner', geometry: [pt(1, 1), pt(2, 1), pt(2, 2), pt(1, 1)] },
        ],
      },
    ],
    'Тест',
  );
  assert.equal(result.features[0].geometry.type, 'LineString');
  assert.equal(result.features[1].geometry.type, 'MultiPolygon');
  assert.equal(result.features[1].geometry.coordinates[0].length, 2);
  assert.equal(
    geometryFromOsm(
      [
        {
          type: 'relation',
          tags: { type: 'boundary' },
          members: [{ geometry: [pt(0, 0), pt(1, 1)] }],
        },
      ],
      '',
    ).features.length,
    0,
  );
});

test('OSM relation full response resolves member ways and nodes without drawing duplicate boundary edges', () => {
  const result = geometryFromOsm(
    [
      { type: 'node', id: 1, lon: 0, lat: 0 },
      { type: 'node', id: 2, lon: 1, lat: 0 },
      { type: 'node', id: 3, lon: 1, lat: 1 },
      { type: 'way', id: 4, nodes: [1, 2, 3, 1] },
      {
        type: 'relation',
        id: 5,
        tags: { type: 'boundary' },
        members: [{ type: 'way', ref: 4, role: 'outer' }],
      },
    ],
    'Район',
  );
  assert.equal(result.features.length, 1);
  assert.equal(result.features[0].geometry.type, 'MultiPolygon');
  assert.deepEqual(result.features[0].geometry.coordinates[0][0], [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 0],
  ]);
});

test('matching distinguishes real streets and district boundaries from nearby buildings, ferries and bus routes', async () => {
  const { matchingMapObjects } = await import('../lib/place-geometry');
  const objects = [
    {
      type: 'way',
      id: 1,
      tags: { name: 'Bankalar Caddesi', highway: 'residential' },
    },
    { type: 'way', id: 2, tags: { name: 'Bankalar Caddesi', building: 'yes' } },
    {
      type: 'way',
      id: 3,
      tags: { name: 'Eminönü', area: 'yes', amenity: 'ferry_terminal' },
    },
    {
      type: 'relation',
      id: 4,
      tags: { name: 'Eminönü', type: 'route', route: 'bus' },
    },
    {
      type: 'relation',
      id: 5,
      tags: {
        name: 'Sultan Ahmet Mahallesi',
        type: 'boundary',
        boundary: 'administrative',
      },
    },
    {
      type: 'way',
      id: 6,
      tags: { name: 'Another road', highway: 'residential' },
    },
  ];
  assert.deepEqual(
    matchingMapObjects(objects, undefined, ['Bankalar Caddesi'], 'street').map(
      (e) => e.id,
    ),
    [1],
  );
  assert.equal(
    matchingMapObjects(objects, 'Q1767191', ['Eminönü'], 'district').length,
    0,
  );
  assert.deepEqual(
    matchingMapObjects(objects, 'Q2147870', ['Sultan Ahmet'], 'district').map(
      (e) => e.id,
    ),
    [5],
  );
});

test('classifies the place itself rather than a street mentioned in its address', async () => {
  const { placeAreaKind } = await import('../lib/place-kind');
  assert.equal(
    placeAreaKind('Галата', 'Галата́ — исторический район Стамбула.'),
    'district',
  );
  assert.equal(
    placeAreaKind(
      'Истикляль (Стамбул)',
      'Улица Истикляль (тур. İstiklal Caddesi) — популярная улица.',
    ),
    'street',
  );
  assert.equal(
    placeAreaKind(
      'Atlas Sineması',
      'Atlas Sineması — кинотеатр, располагающийся на улице Истикляль в районе Бейоглу.',
    ),
    null,
  );
  assert.equal(
    placeAreaKind(
      'Византий',
      'Виза́нтий — древнегреческий город. Сейчас входит в район Фатих.',
    ),
    null,
  );
});

test('real public OSM data produces the entire street and administrative polygon', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = JSON.parse(
    await readFile('tests/fixtures/public-osm-places.json', 'utf8'),
  );
  const { matchingMapObjects } = await import('../lib/place-geometry');
  const ways = matchingMapObjects(
    source.istiklal,
    'Q344348',
    ['İstiklal Caddesi'],
    'street',
  );
  const street = geometryFromOsm(
    [...source.istiklal.filter((e: any) => e.type === 'node'), ...ways],
    'Истикляль',
  );
  assert.equal(street.features.length, 1);
  assert.equal(street.features[0].geometry.coordinates.length, 53);
  const district = geometryFromOsm(source.sultan, 'Султанахмет');
  assert.equal(district.features[0].geometry.type, 'MultiPolygon');
  assert.equal(district.features[0].properties.kind, 'district');
  assert.equal(
    matchingMapObjects(
      source.bankalar,
      'Q806711',
      ['Bankalar Caddesi'],
      'street',
    ).length,
    6,
  );
});

test('geometry resolves only public article coordinates, persists success and retains it when providers fail', async (t) => {
  const { readFile } = await import('node:fs/promises');
  const source = JSON.parse(
    await readFile('tests/fixtures/public-osm-places.json', 'utf8'),
  );
  const { placeGeometry } = await import('../lib/place-geometry');
  const original = globalThis.fetch;
  let calls = 0,
    failed = false;
  const urls: string[] = [];
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  globalThis.fetch = async (input) => {
    calls++;
    const url = String(input);
    urls.push(url);
    if (failed) throw Error('Network unavailable');
    if (url.includes('/page/summary/'))
      return Response.json({
        pageid: 99001,
        wikibase_item: 'Q344348',
        coordinates: { lat: 41.03416667, lon: 28.97888889 },
      });
    if (url.includes('wikidata.org'))
      return Response.json({
        entities: {
          Q344348: {
            labels: { tr: { value: 'İstiklal Caddesi' } },
            claims: {},
          },
        },
      });
    if (url.includes('openstreetmap.org'))
      return Response.json({ elements: source.istiklal });
    throw Error('Unexpected source');
  };
  try {
    const first = await placeGeometry(
      99001,
      'Тестовая улица',
      'Улица Истикляль (тур. İstiklal Caddesi) — улица.',
    );
    assert.equal(first.features.length, 1);
    const count = calls;
    t.mock.timers.tick(16 * 60 * 1000);
    assert.deepEqual(
      await placeGeometry(99001, 'Тестовая улица', 'Улица Истикляль'),
      first,
    );
    assert.equal(calls, count);
    t.mock.timers.tick(25 * 60 * 60 * 1000);
    failed = true;
    assert.deepEqual(
      await placeGeometry(99001, 'Тестовая улица', 'Улица Истикляль'),
      first,
    );
    assert.ok(urls.some((url) => url.includes('bbox=28.97')));
    assert.ok(!urls.some((url) => url.includes('/media/')));
  } finally {
    globalThis.fetch = original;
    t.mock.timers.reset();
  }
});
