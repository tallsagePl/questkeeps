import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
process.env.DATABASE_PATH = './data/map-details-' + randomUUID() + '.sqlite';
const { db, run, hash } = await import('../lib/db');
const { addMapDetails, mapCity, captureClock } =
  await import('../lib/map-details');
const { mapRegions, mapDateTime } = await import('../lib/map-regions');
after(() => db.close());
test('области имеют локализованные названия, время сохраняется без смещения и внутренние поля не выдаются', () => {
  assert.equal(mapCity(55.75, 37.62)?.names?.ru, 'Москва');
  assert.equal(mapCity(41.02, 28.96)?.names?.ru, 'Стамбул');
  assert.equal(mapCity(36.9, 30.7)?.names?.en, 'Antalya');
  assert.equal(captureClock('2026:10:11 13:47:28'), '13:47');
  assert.equal(captureClock('2026-10-11'), null);
  assert.equal(captureClock('2026-10-11T29:62:00'), null);
  const key = hash('account|resource|version');
  run(
    'INSERT INTO exif_cache VALUES (?,?,?)',
    key,
    JSON.stringify({ DateTimeOriginal: '2026:10:11 13:47:28' }),
    Date.now(),
  );
  const result = addMapDetails([
    {
      id: 'one',
      _account_id: 'account',
      _resource_id: 'resource',
      revision: 'version',
      taken: '2026-10-11',
      name: 'IMG.heic',
      lat: 41.02,
      lon: 28.96,
    },
  ]);
  assert.equal(result[0].capture_time, '13:47');
  assert.equal(result[0]._account_id, undefined);
  assert.equal(result[0]._resource_id, undefined);
  assert.match(mapDateTime('2026-10-11', '13:47', 'ru'), /13:47/);
  assert.ok(!mapDateTime('2026-10-11', null, 'ru').includes('00:00'));
  const points = [
    { id: 'a', lat: 41.02, lon: 28.96, map_city: mapCity(41.02, 28.96) },
    { id: 'b', lat: 41.04, lon: 28.98, map_city: mapCity(41.04, 28.98) },
    { id: 'c', lat: 36.9, lon: 30.7, map_city: mapCity(36.9, 30.7) },
  ];
  const groups = mapRegions(points, 'ru');
  assert.deepEqual(
    groups.map((group) => group.label),
    ['Стамбул', 'Анталья'],
  );
  assert.equal(groups[0].points.length, 2);
});
