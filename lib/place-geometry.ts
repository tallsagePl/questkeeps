import { MemoryCache } from './memory-cache';
import { wiki } from './places';
import { one, run } from './db';
import { placeAreaKind } from './place-kind';

export { isAreaPlace } from './place-kind';

export type PlaceGeometry = {
  type: 'FeatureCollection';
  features: any[];
  title?: string;
  schemaVersion?: number;
};

type Coord = [number, number];

const same = (a: Coord, b: Coord) => a[0] === b[0] && a[1] === b[1];

function stitch(parts: Coord[][]) {
  const pending = parts
    .filter((part) => part.length > 1)
    .map((part) => [...part]);
  const rings: Coord[][] = [];
  while (pending.length) {
    let ring = pending.shift()!;
    let joined = true;
    while (joined && !same(ring[0], ring[ring.length - 1])) {
      joined = false;
      for (let i = 0; i < pending.length; i++) {
        const line = pending[i];
        if (same(ring[ring.length - 1], line[0])) ring.push(...line.slice(1));
        else if (same(ring[ring.length - 1], line[line.length - 1]))
          ring.push(...[...line].reverse().slice(1));
        else if (same(ring[0], line[line.length - 1]))
          ring = [...line.slice(0, -1), ...ring];
        else if (same(ring[0], line[0]))
          ring = [...[...line].reverse().slice(0, -1), ...ring];
        else continue;
        pending.splice(i, 1);
        joined = true;
        break;
      }
    }
    if (ring.length >= 4 && same(ring[0], ring[ring.length - 1]))
      rings.push(ring);
  }
  return rings;
}

function inside(point: Coord, ring: Coord[]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}

export function geometryFromOsm(elements: any[], title: string): PlaceGeometry {
  const features: any[] = [];
  const coords = (geometry: any[]) =>
    (geometry || [])
      .filter(
        (p) =>
          Number.isFinite(p?.lon) &&
          Number.isFinite(p?.lat) &&
          Math.abs(p.lon) <= 180 &&
          Math.abs(p.lat) <= 90,
      )
      .map((p) => [p.lon, p.lat] as Coord);
  const nodes = new Map(
    elements.filter((e) => e.type === 'node').map((e) => [e.id, e]),
  );
  const ways = new Map(
    elements.filter((e) => e.type === 'way').map((e) => [e.id, e]),
  );
  const wayGeometry = (way: any) =>
    way?.geometry || (way?.nodes || []).map((id: number) => nodes.get(id));
  const memberGeometry = (member: any) =>
    member.geometry ||
    (member.type === 'way' ? wayGeometry(ways.get(member.ref)) : []);
  const relationWays = new Set(
    elements
      .filter((e) => e.type === 'relation')
      .flatMap((e) =>
        (e.members || [])
          .filter((m: any) => m.type === 'way')
          .map((m: any) => m.ref),
      ),
  );
  for (const element of elements) {
    if (element.type === 'way' && relationWays.has(element.id)) continue;
    const tags = element.tags || {};
    const properties = { title, kind: 'street' };
    if (
      element.type === 'relation' &&
      ['multipolygon', 'boundary'].includes(tags.type)
    ) {
      const outer = stitch(
        (element.members || [])
          .filter((member: any) => member.role !== 'inner')
          .map((member: any) => coords(memberGeometry(member))),
      );
      const inner = stitch(
        (element.members || [])
          .filter((member: any) => member.role === 'inner')
          .map((member: any) => coords(memberGeometry(member))),
      );
      if (outer.length)
        features.push({
          type: 'Feature',
          properties: { title, kind: 'district' },
          geometry: {
            type: 'MultiPolygon',
            coordinates: outer.map((ring) => [
              ring,
              ...inner.filter((hole) => inside(hole[0], ring)),
            ]),
          },
        });
    } else if (element.type === 'way') {
      const line = coords(wayGeometry(element));
      if (line.length < 2) continue;
      const area =
        (tags.area === 'yes' || tags.boundary || tags.place) &&
        line.length >= 4 &&
        same(line[0], line[line.length - 1]);
      features.push({
        type: 'Feature',
        properties: { ...properties, kind: area ? 'district' : 'street' },
        geometry: area
          ? { type: 'Polygon', coordinates: [line] }
          : { type: 'LineString', coordinates: line },
      });
    } else if (element.type === 'relation' && tags.type === 'route') {
      const lines = (element.members || [])
        .map((member: any) => coords(memberGeometry(member)))
        .filter((line: Coord[]) => line.length > 1);
      if (lines.length)
        features.push({
          type: 'Feature',
          properties,
          geometry: { type: 'MultiLineString', coordinates: lines },
        });
    }
  }
  return { type: 'FeatureCollection', features };
}

const cache = new MemoryCache<number, Promise<PlaceGeometry>>();

let queue: Promise<void> = Promise.resolve();

let lastRequest = 0;

const providerBackoff = new Map<string, number>();

export async function osmRequest(
  url: string,
  timeoutMs = 12000,
  request: RequestInit = {},
) {
  const pending = queue.then(async () => {
    const host = new URL(url).host;
    if ((providerBackoff.get(host) || 0) > Date.now())
      throw Error('Границы мест временно недоступны');
    const wait = Math.max(0, 1000 - (Date.now() - lastRequest));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequest = Date.now();
    try {
      const response = await fetch(url, {
        ...request,
        headers: {
          'User-Agent':
            'QuestKeeps (personal travel journal; public OSM geometry)',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok)
        throw Object.assign(Error('Границы мест временно недоступны'), {
          status: response.status,
        });
      const result = await response.json();
      if (result.remark) throw Error('Границы мест временно недоступны');
      return result;
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (!status || status === 429 || status >= 500)
        providerBackoff.set(host, Date.now() + 5 * 60 * 1000);
      throw error;
    }
  });
  queue = pending.then(
    () => {},
    () => {},
  );
  return pending;
}

export async function overpass(query: string, timeoutMs = 12000) {
  const providers = process.env.OVERPASS_ENDPOINT
    ? [process.env.OVERPASS_ENDPOINT]
    : [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.private.coffee/api/interpreter',
      ];
  for (const endpoint of providers) {
    try {
      // POST avoids URL filtering/length limits on city-wide geometry requests.
      const result = await osmRequest(endpoint, timeoutMs, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
      });
      return result.elements || [];
    } catch {
      /* Try the next provider; failed hosts have a five-minute cooldown. */
    }
  }
  throw Error('Границы мест временно недоступны');
}

const areaMaps = new MemoryCache<string, Promise<any[]>>();

const normalizedName = (value: string) =>
  value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/\bmahallesi\b/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');

export function matchingMapObjects(
  elements: any[],
  qid: string | undefined,
  names: string[],
  kind: 'street' | 'district',
) {
  const wanted = new Set(names.map(normalizedName));
  const square = names.some((name) => /площад|square|meydan/i.test(name));
  return elements.filter((element) => {
    const tags = element.tags || {};
    if (element.type === 'node') return false;
    const eligible =
      kind === 'street'
        ? (element.type === 'way' && tags.highway && tags.area !== 'yes') ||
          (element.type === 'relation' &&
            tags.type === 'route' &&
            tags.route === 'road')
        : (element.type === 'relation' &&
            ['boundary', 'multipolygon'].includes(tags.type) &&
            (tags.boundary || tags.place)) ||
          (element.type === 'way' &&
            !tags.building &&
            (tags.place ||
              tags.boundary ||
              (square &&
                tags.area === 'yes' &&
                ['pedestrian', 'footway'].includes(tags.highway))));
    if (!eligible) return false;
    return (
      (!!qid && tags.wikidata === qid) ||
      Object.entries(tags).some(
        ([key, value]) =>
          /^(?:name(?::[a-z-]+)?|alt_name|official_name|short_name)$/.test(
            key,
          ) &&
          String(value)
            .split(';')
            .some((name) => wanted.has(normalizedName(name))),
      )
    );
  });
}

export async function publicLocalMap(lat: number, lon: number) {
  const y = Math.round(lat * 100) / 100;
  const x = Math.round(lon * 100) / 100;
  const key = y + ',' + x;
  let pending = areaMaps.get(key);
  if (!pending) {
    const bbox = [
      Math.max(-180, x - 0.008),
      Math.max(-90, y - 0.006),
      Math.min(180, x + 0.008),
      Math.min(90, y + 0.006),
    ]
      .map((n) => n.toFixed(5))
      .join(',');
    pending = osmRequest(
      'https://api.openstreetmap.org/api/0.6/map.json?bbox=' + bbox,
    ).then((result) => result.elements || []);
    areaMaps.set(key, pending);
    void pending.catch(() => {
      if (areaMaps.get(key) === pending) areaMaps.delete(key);
    });
  }
  return pending;
}

export async function placeGeometry(
  pageId: number,
  title: string,
  summary: string,
): Promise<PlaceGeometry> {
  const kind = placeAreaKind(title, summary);
  if (!kind) return { type: 'FeatureCollection', features: [] };
  const saved = cache.get(pageId);
  if (saved) return saved;
  const stored = one(
    'SELECT json,updated FROM place_geometry_cache WHERE page_id=?',
    pageId,
  );
  let previous: PlaceGeometry | undefined;
  try {
    if (stored) {
      const value = JSON.parse(stored.json);
      if (value.schemaVersion === 2) previous = value;
    }
  } catch {}
  if (
    previous?.features.length &&
    Date.now() - stored!.updated < 24 * 60 * 60 * 1000
  )
    return previous;
  const pending = (async () => {
    try {
      let page: any;
      try {
        // Coordinates come only from the public article, never from a user's photograph.
        const response = await fetch(
          'https://ru.wikipedia.org/api/rest_v1/page/summary/' +
            encodeURIComponent(title.replace(/ /g, '_')),
          {
            signal: AbortSignal.timeout(12000),
            headers: { 'User-Agent': 'QuestKeeps/1.0 (travel journal)' },
          },
        );
        if (response.ok) {
          const article = await response.json();
          if (article.pageid === pageId)
            page = {
              pageprops: { wikibase_item: article.wikibase_item },
              coordinates: article.coordinates ? [article.coordinates] : [],
            };
        }
      } catch {}
      if (!page) {
        const data = await wiki({
          pageids: String(pageId),
          prop: 'coordinates|pageprops',
          ppprop: 'wikibase_item',
        });
        page = data.query?.pages?.[pageId];
      }
      const qid = page?.pageprops?.wikibase_item;
      if (!/^Q[1-9][0-9]*$/.test(qid || ''))
        return (
          previous || {
            type: 'FeatureCollection' as const,
            features: [],
            title,
          }
        );
      let entity: any;
      try {
        const response = await fetch(
          'https://www.wikidata.org/w/api.php?' +
            new URLSearchParams({
              action: 'wbgetentities',
              format: 'json',
              ids: qid,
              props: 'claims|labels',
            }),
          {
            signal: AbortSignal.timeout(12000),
            headers: { 'User-Agent': 'QuestKeeps/1.0 (travel journal)' },
          },
        );
        if (response.ok) entity = (await response.json()).entities?.[qid];
      } catch {}
      const names = [
        title,
        title.replace(/\s*\([^)]*\)\s*/g, ''),
        ...(Object.values(entity?.labels || {}) as any[]).map(
          (label) => label.value,
        ),
      ];
      // Article-native names can still match the map if Wikidata is unavailable.
      for (const match of summary.matchAll(
        /(?:тур\.|англ\.|фр\.|нем\.|исп\.)\s+([^;()—]+?)(?=[;)—]|$)/gu,
      ))
        names.push(match[1].split(',')[0].trim());
      let collection: PlaceGeometry = {
        type: 'FeatureCollection',
        features: [],
      };
      const relationId = entity?.claims?.P402?.[0]?.mainsnak?.datavalue?.value;
      if (/^[1-9][0-9]*$/.test(String(relationId || ''))) {
        try {
          const result = await osmRequest(
            'https://api.openstreetmap.org/api/0.6/relation/' +
              relationId +
              '/full.json',
          );
          collection = geometryFromOsm(result.elements || [], title);
        } catch {}
      }
      const coordinate = page?.coordinates?.[0];
      let mappedPointOnly = false;
      if (
        !collection.features.length &&
        Number.isFinite(coordinate?.lat) &&
        Number.isFinite(coordinate?.lon)
      ) {
        const elements = await publicLocalMap(coordinate.lat, coordinate.lon);
        const matches = matchingMapObjects(elements, qid, names, kind);
        mappedPointOnly =
          kind === 'district' &&
          !matches.length &&
          elements.some(
            (element: any) =>
              element.type === 'node' &&
              element.tags?.wikidata === qid &&
              element.tags?.place,
          );
        const nodes = elements.filter(
          (element: any) => element.type === 'node',
        );
        collection = geometryFromOsm(
          [
            ...nodes,
            ...matches.filter((element: any) => element.type === 'way'),
          ],
          title,
        );
        for (const relation of matches.filter(
          (element: any) => element.type === 'relation',
        )) {
          const result = await osmRequest(
            'https://api.openstreetmap.org/api/0.6/relation/' +
              relation.id +
              '/full.json',
          );
          collection.features.push(
            ...geometryFromOsm(result.elements || [], title).features,
          );
        }
      }
      if (!collection.features.length && !mappedPointOnly) {
        try {
          collection = geometryFromOsm(
            await overpass(
              '[out:json][timeout:8];nwr["wikidata"="' + qid + '"];out geom;',
            ),
            title,
          );
        } catch {}
      }
      if (collection.features.length) {
        collection.schemaVersion = 2;
        run(
          'INSERT INTO place_geometry_cache(page_id,json,updated) VALUES (?,?,?) ON CONFLICT(page_id) DO UPDATE SET json=excluded.json,updated=excluded.updated',
          pageId,
          JSON.stringify(collection),
          Date.now(),
        );
        return collection;
      }
      return previous || { ...collection, title };
    } catch (error) {
      if (previous?.features.length) return previous;
      throw error;
    }
  })();
  cache.set(pageId, pending);
  void pending.catch(() => {
    if (cache.get(pageId) === pending) cache.delete(pageId);
  });
  return pending;
}
