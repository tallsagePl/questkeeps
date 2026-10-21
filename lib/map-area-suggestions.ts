import { russianAreaTitle, russianAreaDescription } from './area-localization';
import { all, one, run, db, id, type Row } from './db';
import { closestCity } from './city-lookup';
import { overpass, geometryFromOsm } from './place-geometry';
import { photoInArea } from './area-membership';
import { MemoryCache } from './memory-cache';
import { membership, fail } from './access';
const discovered = new MemoryCache<
  string,
  Promise<{ ids: string[]; incomplete: boolean }>
>();
export const osmAreaId = (url: string) => {
  const match = url.match(
    new RegExp(
      '^https://www[.]openstreetmap[.]org/(way|relation)/([1-9][0-9]*)$',
    ),
  );
  return match ? 'osm-' + match[1] + '-' + match[2] : null;
};
const normal = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
export function eligibleAreaObject(e: any) {
  const t = e.tags || {};
  return (
    !!t.name &&
    ((e.type === 'way' &&
      t.highway &&
      t.area !== 'yes' &&
      ![
        'motorway',
        'motorway_link',
        'trunk',
        'trunk_link',
        'construction',
        'proposed',
        'steps',
      ].includes(t.highway)) ||
      (e.type === 'relation' &&
        ['boundary', 'multipolygon'].includes(t.type) &&
        (['neighbourhood', 'quarter', 'suburb'].includes(t.place) ||
          (t.boundary === 'administrative' &&
            Number(t.admin_level) >= 8 &&
            Number(t.admin_level) <= 10))) ||
      (e.type === 'way' &&
        t.place &&
        ['neighbourhood', 'quarter', 'suburb'].includes(t.place)))
  );
}
// closestCity accepts points up to 35 km away. Use the same fixed public-city
// coverage everywhere, with a margin; neither GPS nor a trip-derived radius is sent.
export const PUBLIC_CITY_RADIUS_METERS = 40000;
export const areaCityCacheKey = (lat: number, lon: number) =>
  'v3:' + lat + ',' + lon + ':' + PUBLIC_CITY_RADIUS_METERS;
export async function discoverCity(lat: number, lon: number) {
  const radius = PUBLIC_CITY_RADIUS_METERS;
  const key = areaCityCacheKey(lat, lon);
  let pending = discovered.get(key);
  if (pending) return pending;
  pending = (async () => {
    // This seed is the public GeoNames city centre, never a photograph coordinate.
    const stored = one(
      'SELECT json,updated FROM map_area_city_cache WHERE key=?',
      key,
    );
    if (stored && Date.now() - stored.updated < 86400000)
      return { ids: JSON.parse(stored.json) as string[], incomplete: false };
    // Request complete geometry, including boundaries crossing the search circle.
    // Unlike the old tile grid, this covers the old town and outlying photo clusters.
    const around = '(around:' + radius + ',' + lat + ',' + lon + ')';
    const elements = await overpass(
      '[out:json][timeout:40];(' +
        'way["name"]["highway"]' +
        around +
        ';' +
        'wr["name"]["place"~"^(neighbourhood|quarter|suburb)$"]' +
        around +
        ';' +
        'rel["name"]["boundary"="administrative"]["admin_level"~"^(8|9|10)$"]' +
        around +
        ';' +
        ');out geom;',
      50000,
    );
    let incomplete = false;
    const nodes = elements.filter((e: any) => e.type === 'node');
    const candidates = elements.filter(eligibleAreaObject);
    const streetGroups = new Map<string, any[]>();
    for (const candidate of candidates) {
      if (candidate.type !== 'way' || !candidate.tags?.highway) continue;
      const name = normal(candidate.tags.name);
      const group = streetGroups.get(name) || [];
      group.push(candidate);
      streetGroups.set(name, group);
    }
    const results: string[] = [];
    const seenWays = new Set<number>();
    for (const object of candidates) {
      if (object.type === 'way' && seenWays.has(object.id)) continue;
      let pieces = [object];
      if (object.type === 'way' && object.tags.highway) {
        // Only connected segments of the same named street belong together.
        const connected = new Set<number>(object.nodes || []);
        const sameName = streetGroups.get(normal(object.tags.name)) || [];
        let changed = true;
        while (changed) {
          changed = false;
          for (const way of sameName) {
            if (pieces.includes(way)) continue;
            if (way.nodes?.some((n: number) => connected.has(n))) {
              pieces.push(way);
              way.nodes.forEach((n: number) => connected.add(n));
              changed = true;
            }
          }
        }
        pieces.forEach((e: any) => seenWays.add(e.id));
      }
      const objectId =
        object.type === 'way'
          ? Math.min(...pieces.map((e: any) => e.id))
          : object.id;
      const areaId = 'osm-' + object.type + '-' + objectId;
      // Rebuild even recently saved streets: wider coverage can add connected segments.
      const geometry = geometryFromOsm(
        object.type === 'relation' ? [object] : [...nodes, ...pieces],
        object.tags['name:ru'] || object.tags.name,
      );
      if (!geometry.features.length) {
        incomplete = true;
        continue;
      }
      const kind = geometry.features.some(
        (f: any) => f.properties.kind === 'district',
      )
        ? 'district'
        : 'street';
      const title = object.tags['name:ru'] || object.tags.name;
      const summary =
        title +
        ' — ' +
        (kind === 'street'
          ? 'улица. Фотографии привязаны к участку в пределах 30 м от линии улицы.'
          : 'район. Фотографии привязаны по границам района на OpenStreetMap.');
      const coords = geometry.features[0].geometry.coordinates.flat(4);
      const pairs = [];
      for (let i = 0; i + 1 < coords.length; i += 2)
        if (Number.isFinite(coords[i]) && Number.isFinite(coords[i + 1]))
          pairs.push([coords[i], coords[i + 1]]);
      if (!pairs.length) continue;
      const x = pairs.reduce((n, p) => n + p[0], 0) / pairs.length,
        y = pairs.reduce((n, p) => n + p[1], 0) / pairs.length;
      run(
        'INSERT INTO map_areas VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,summary=excluded.summary,geometry=excluded.geometry,updated=excluded.updated',
        areaId,
        title,
        kind,
        summary,
        'https://www.openstreetmap.org/' + object.type + '/' + objectId,
        y,
        x,
        JSON.stringify(geometry),
        Date.now(),
      );
      results.push(areaId);
    }
    if (!incomplete)
      run(
        'INSERT INTO map_area_city_cache VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json,updated=excluded.updated',
        key,
        JSON.stringify(results),
        Date.now(),
      );
    return { ids: results, incomplete };
  })().catch((error) => {
    // Keep previously downloaded public geometry visible during provider outages.
    const fallback =
      one('SELECT json FROM map_area_city_cache WHERE key=?', key) ||
      one(
        'SELECT json FROM map_area_city_cache WHERE key=?',
        'v2:' + lat + ',' + lon,
      );
    if (fallback)
      return { ids: JSON.parse(fallback.json) as string[], incomplete: true };
    throw error;
  });
  discovered.set(key, pending);
  void pending.then(
    (result) => {
      if (result.incomplete) discovered.delete(key);
    },
    () => discovered.delete(key),
  );
  return pending;
}
export function accessibleAreaPhotos(tripId: string, userId: string) {
  const trip = membership(tripId, userId);
  const photos = all(
    "SELECT m.* FROM media m JOIN sources s ON s.id=m.source_id WHERE m.trip_id=? AND m.kind='photo' AND m.hidden=0 AND m.missing=0 AND s.approved=1 AND m.lat IS NOT NULL AND m.lon IS NOT NULL AND substr(m.taken,1,10)>=? AND substr(m.taken,1,10)<=? AND (?=1 OR m.user_id=?)",
    tripId,
    trip.from,
    trip.to,
    Number(trip.role === 'owner'),
    userId,
  );
  return { trip, photos };
}
export async function areaSuggestions(tripId: string, userId: string) {
  const { photos } = accessibleAreaPhotos(tripId, userId);
  const seeds = new Map<string, { lat: number; lon: number }>();
  for (const photo of photos) {
    const city = closestCity(photo.lat, photo.lon);
    if (city) {
      const key = city.country + ':' + city.name;
      seeds.set(key, {
        lat: city.lat,
        lon: city.lon,
      });
    }
  }
  let incomplete = false;
  const ids = new Set<string>();
  for (const city of seeds.values()) {
    try {
      const result = await discoverCity(city.lat, city.lon);
      result.ids.forEach((id) => ids.add(id));
      incomplete ||= result.incomplete;
    } catch {
      incomplete = true;
    }
  }
  const known = all(
    'SELECT DISTINCT url,title FROM confirmed_places WHERE trip_id=?',
    tripId,
  );
  const knownShapes = known.flatMap((place) => {
    const pageId = Number(new URL(place.url).searchParams.get('curid'));
    const row = one(
      'SELECT json FROM place_geometry_cache WHERE page_id=?',
      pageId,
    );
    try {
      return row
        ? JSON.parse(row.json).features.map((f: any) =>
            JSON.stringify(f.geometry),
          )
        : [];
    } catch {
      return [];
    }
  });
  const candidates = [];
  for (const areaId of ids) {
    const area = one('SELECT * FROM map_areas WHERE id=?', areaId)!;
    const title = russianAreaTitle(
      area.title,
      closestCity(area.lat, area.lon)?.country,
    );
    const geometry = JSON.parse(area.geometry);
    const photoIds = photos
      .filter((p) => photoInArea(p as any, geometry))
      .map((p) => p.id);
    if (
      !photoIds.length ||
      known.some(
        (p) =>
          p.url === area.url ||
          normal(p.title) === normal(area.title) ||
          normal(p.title) === normal(title),
      ) ||
      geometry.features.some((f: any) =>
        knownShapes.includes(JSON.stringify(f.geometry)),
      )
    )
      continue;
    run(
      'INSERT OR IGNORE INTO trip_area_candidates VALUES (?,?)',
      tripId,
      areaId,
    );
    const sameStreet =
      area.kind === 'street'
        ? candidates.find(
            (candidate) =>
              candidate.kind === 'street' &&
              normal(candidate.originalTitle || candidate.title) ===
                normal(area.title) &&
              candidate.photoIds.some((id: string) => photoIds.includes(id)),
          )
        : undefined;
    if (sameStreet) {
      const existing = new Set(
        sameStreet.geometry.features.map((feature: any) =>
          JSON.stringify(feature.geometry),
        ),
      );
      sameStreet.geometry.features.push(
        ...geometry.features.filter(
          (feature: any) => !existing.has(JSON.stringify(feature.geometry)),
        ),
      );
      sameStreet.photoIds = [...new Set([...sameStreet.photoIds, ...photoIds])];
      run(
        'UPDATE map_areas SET geometry=? WHERE id=?',
        JSON.stringify(sameStreet.geometry),
        sameStreet.id,
      );
      continue;
    }
    candidates.push({
      id: area.id,
      title,
      originalTitle: area.title,
      kind: area.kind,
      photoIds,
      geometry,
      url: area.url,
    });
  }
  return { candidates, incomplete };
}
export function addAreaToPhotos(
  tripId: string,
  userId: string,
  areaId: string,
) {
  const { photos } = accessibleAreaPhotos(tripId, userId);
  const area =
    one(
      'SELECT a.* FROM map_areas a JOIN trip_area_candidates c ON c.area_id=a.id WHERE c.trip_id=? AND a.id=?',
      tripId,
      areaId,
    ) || fail(404, 'Предложение места не найдено');
  const savedWiki = one(
    'SELECT json FROM map_area_wiki WHERE area_id=?',
    areaId,
  );
  const wikiInfo = savedWiki ? JSON.parse(savedWiki.json) : null;
  const title =
    wikiInfo?.localizationVersion >= 2 && wikiInfo.title
      ? wikiInfo.title
      : russianAreaTitle(area.title, closestCity(area.lat, area.lon)?.country);
  const summary =
    wikiInfo?.localizationVersion >= 2 && wikiInfo.description
      ? wikiInfo.description
      : russianAreaDescription(title, area.kind);
  const geometry = JSON.parse(area.geometry);
  const matches = photos.filter((p) => photoInArea(p as any, geometry));
  if (!matches.length) fail(400, 'В этой области нет доступных фотографий');
  let added = 0;
  db.transaction(() => {
    for (const photo of matches) {
      const result = run(
        'INSERT INTO confirmed_places(id,trip_id,media_id,title,summary,url,lat,lon,day,distance) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(trip_id,media_id,url) DO NOTHING',
        id(),
        tripId,
        photo.id,
        title,
        summary,
        area.url,
        area.lat,
        area.lon,
        photo.taken.slice(0, 10),
        0,
      );
      if (result.changes) {
        added++;
        run(
          'INSERT INTO media_titles VALUES (?,?) ON CONFLICT(media_id) DO UPDATE SET title=excluded.title',
          photo.id,
          title.slice(0, 160),
        );
      }
    }
  })();
  return { added, matched: matches.length, title };
}
