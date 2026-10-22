import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locationOptions } from '../lib/location-options';

test('country search has all ISO countries and city search respects selected countries and localized names', () => {
  assert.equal(locationOptions('countries', '', 'ru', []).length, 249);
  assert.equal(locationOptions('countries', 'Турц', 'ru', [])[0].id, 'TR');
  const cities = locationOptions('cities', 'Стамбул', 'ru', ['TR']);
  assert.ok(cities.some((city) => city.label === 'Стамбул'));
  assert.equal(locationOptions('cities', 'Стамбул', 'ru', ['GE']).length, 0);
  assert.equal(locationOptions('cities', 'С', 'ru', []).length, 0);
});
