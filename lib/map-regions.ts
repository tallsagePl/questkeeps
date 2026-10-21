import { distanceMeters } from './geo';
export type MapRegionPoint = {
  id: string;
  lat: number;
  lon: number;
  map_city?: {
    key: string;
    name: string;
    names?: Partial<Record<'ru' | 'en', string>>;
  } | null;
};
export function mapRegions<T extends MapRegionPoint>(
  points: T[],
  language: 'ru' | 'en',
) {
  const groups: { key: string; label: string; points: T[] }[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
    const city = point.map_city;
    let group = city
      ? groups.find((group) => group.key === city.key)
      : groups.find(
          (group) =>
            group.key.startsWith('area:') &&
            distanceMeters(
              point.lat,
              point.lon,
              group.points[0].lat,
              group.points[0].lon,
            ) < 4000,
        );
    if (!group) {
      group = {
        key: city?.key || 'area:' + point.id,
        label: city
          ? city.names?.[language] || city.name
          : (language === 'ru' ? 'Область ' : 'Area ') +
            (groups.filter((g) => g.key.startsWith('area:')).length + 1),
        points: [],
      };
      groups.push(group);
    }
    group.points.push(point);
  }
  return groups;
}
export function mapDateTime(
  taken: string,
  clock: string | null | undefined,
  language: 'ru' | 'en',
) {
  const date = new Date(taken.slice(0, 10) + 'T12:00:00').toLocaleDateString(
    language === 'en' ? 'en-GB' : 'ru-RU',
    { day: 'numeric', month: 'long', year: 'numeric' },
  );
  const fromTaken = taken.match(/[T ](\d{2}:\d{2})/);
  const time = clock || fromTaken?.[1];
  return date + (time ? ' · ' + time : '');
}
