import { MemoryCache } from './memory-cache';
import { one, hash, type Row } from './db';
import { closestCity } from './city-lookup';
import { distanceMeters } from './geo';

// Metropolitan anchors avoid labelling a whole visit after a small nearby district.
const metros = [
  {
    name: 'Moscow',
    names: { ru: 'Москва', en: 'Moscow' },
    country: 'RU',
    lat: 55.75204,
    lon: 37.61781,
  },
  {
    name: 'Istanbul',
    names: { ru: 'Стамбул', en: 'Istanbul' },
    country: 'TR',
    lat: 41.01384,
    lon: 28.94966,
  },
  {
    name: 'Antalya',
    names: { ru: 'Анталья', en: 'Antalya' },
    country: 'TR',
    lat: 36.90812,
    lon: 30.69556,
  },
];

type MapCity = {
  key: string;
  name: string;
  names?: Partial<Record<'ru' | 'en', string>>;
};

const cityCache = new MemoryCache<string, MapCity | null>();

export function mapCity(lat: number, lon: number): MapCity | null {
  const key = lat.toFixed(4) + ':' + lon.toFixed(4);
  if (cityCache.has(key)) return cityCache.get(key)!;
  const metro = metros
    .filter((city) => distanceMeters(lat, lon, city.lat, city.lon) <= 50000)
    .sort(
      (a, b) =>
        distanceMeters(lat, lon, a.lat, a.lon) -
        distanceMeters(lat, lon, b.lat, b.lon),
    )[0];
  const city = metro || closestCity(lat, lon);
  const result = city
    ? {
        key: city.country + ':' + city.name,
        name: city.name,
        names: city.names,
      }
    : null;
  if (cityCache.size > 10000) cityCache.clear();
  cityCache.set(key, result);
  return result;
}

export function captureClock(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = value.match(/[T ](\d{2})[:-](\d{2})(?:[:-]\d{2})?/);
  return match && Number(match[1]) < 24 && Number(match[2]) < 60
    ? match[1] + ':' + match[2]
    : null;
}

export function addMapDetails(media: Row[]) {
  for (const item of media) {
    const cacheKey = hash(
      item._account_id + '|' + item._resource_id + '|' + (item.revision || ''),
    );
    const cached = one('SELECT json FROM exif_cache WHERE key=?', cacheKey);
    let exif: Row = {};
    try {
      if (cached) exif = JSON.parse(cached.json);
    } catch {}
    item.capture_time =
      captureClock(exif.DateTimeOriginal) ||
      captureClock(item.taken) ||
      (item.name.startsWith(item.taken.slice(0, 10))
        ? captureClock(item.name)
        : null);
    item.map_city =
      Number.isFinite(item.lat) && Number.isFinite(item.lon)
        ? mapCity(item.lat, item.lon)
        : null;
    delete item._account_id;
    delete item._resource_id;
  }
  return media;
}
