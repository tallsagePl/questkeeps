import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after } from 'node:test';
import { routeLabel } from '../lib/route-label';

process.env.DATABASE_PATH = './data/labels-' + randomUUID() + '.sqlite';

const { closestCity } = await import('../lib/infer-trip');

const { db } = await import('../lib/db');

after(() => db.close());

test('названия маршрута следуют языку, точной географии и разделителю', () => {
  const points = [
    [55.5991, 37.3552],
    [55.63711, 37.38115],
    [55.61194, 37.29611],
    [36.86644, 30.63031],
    [36.90812, 30.69556],
  ];
  const route = points.map(([lat, lon]) => closestCity(lat, lon)!);
  assert.ok(route.every(Boolean));
  assert.equal(
    routeLabel(route, 'ru'),
    'Московский → Солнцево → Внуково → Коньяалты → Анталья || Россия, Турция',
  );
  const english = routeLabel(route, 'en')!;
  assert.ok(
    english.startsWith(
      'Moskovskiy → Solntsevo → Vnukovo → Konyaalti → Antalya || ',
    ),
  );
  assert.ok(!/[А-Яа-яЁё]/.test(english));
  assert.ok(!english.includes(' · '));
  const rome = closestCity(41.89193, 12.51133)!;
  assert.equal(routeLabel([rome], 'ru'), 'Рим || Италия');
  assert.equal(routeLabel([rome], 'en'), 'Rome || Italy');
  assert.equal(routeLabel([], 'ru'), null);
  assert.equal(
    routeLabel(
      [{ name: 'Original local name', country: 'TR', distanceKm: 0 }],
      'ru',
    ),
    'Original local name || Турция',
  );
});
