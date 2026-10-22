import { createRequire } from 'node:module';

type City = { name: string; lat: string; lng: string; country: string };

const require = createRequire(import.meta.url);

let cityGrid: Map<string, City[]> | undefined;

let placeNames:
  Record<string, Partial<Record<'ru' | 'en', string>>> | undefined;

function localizedNames(city: City) {
  if (!placeNames)
    placeNames = {
      ...require('./data/place-names.json'),
      ...require('./data/place-name-overrides.json'),
    };
  return placeNames![
    city.country +
      '|' +
      city.name +
      '|' +
      Number(city.lat).toFixed(5) +
      '|' +
      Number(city.lng).toFixed(5)
  ];
}

function grid() {
  if (cityGrid) return cityGrid;
  cityGrid = new Map();
  const cities = require('cities.json') as City[];
  for (const city of cities) {
    const key =
      Math.floor(Number(city.lat)) + ':' + Math.floor(Number(city.lng));
    const bucket = cityGrid.get(key) || [];
    bucket.push(city);
    cityGrid.set(key, bucket);
  }
  return cityGrid;
}

function distance(lat: number, lon: number, city: City) {
  const rad = Math.PI / 180;
  const dlat = (Number(city.lat) - lat) * rad;
  const dlon = (Number(city.lng) - lon) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(lat * rad) *
      Math.cos(Number(city.lat) * rad) *
      Math.sin(dlon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function closestCity(lat: number, lon: number) {
  const cities = grid();
  let nearest: City | undefined;
  let best = 35;
  const longitudeRange = Math.min(
    180,
    Math.ceil(35 / (111 * Math.max(0.001, Math.cos((lat * Math.PI) / 180)))) +
      1,
  );
  for (
    let y = Math.max(-90, Math.floor(lat) - 1);
    y <= Math.min(89, Math.floor(lat) + 1);
    y++
  ) {
    for (
      let x = Math.floor(lon) - longitudeRange;
      x <= Math.floor(lon) + longitudeRange;
      x++
    ) {
      const normalized = ((((x + 180) % 360) + 360) % 360) - 180;
      for (const city of cities.get(y + ':' + normalized) || []) {
        const km = distance(lat, lon, city);
        if (km < best) {
          best = km;
          nearest = city;
        }
      }
    }
  }
  return nearest
    ? {
        name: nearest.name,
        lat: Number(nearest.lat),
        lon: Number(nearest.lng),
        names: localizedNames(nearest),
        country: nearest.country,
        distanceKm: Math.round(best),
      }
    : null;
}
