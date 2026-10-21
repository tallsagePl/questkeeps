import { MemoryCache, CACHE_TTL } from './memory-cache';
import { fail } from './access';
import { distanceMeters } from './geo';
import { placeTextContent } from './place-text';
import {
  isAttraction,
  clearlyNotAttraction,
  obviousAttraction,
} from './attractions';
let wikiQueue: Promise<void> = Promise.resolve();
let lastWikiRequest = 0;
export function wiki(params: Record<string, string>, language: string = 'ru') {
  if (!/^[a-z]{2,3}$/.test(language))
    throw new Error('Invalid Wikipedia language');
  const result = wikiQueue.then(async () => {
    const wait = Math.max(0, 500 - (Date.now() - lastWikiRequest));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastWikiRequest = Date.now();
    return requestWiki(params, language);
  });
  wikiQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
async function requestWiki(params: Record<string, string>, language: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(
        'https://' +
          language +
          '.wikipedia.org/w/api.php?' +
          new URLSearchParams({ action: 'query', format: 'json', ...params }),
        {
          headers: { 'User-Agent': 'QuestKeeps/0.1 (personal travel journal)' },
          signal: AbortSignal.timeout(12000),
        },
      );
    } catch {
      if (attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * (attempt + 1)),
        );
        continue;
      }
      fail(
        503,
        'Сервис поиска мест временно недоступен. Попробуй немного позже.',
      );
    }
    if ([429, 502, 503, 504].includes(res.status)) {
      if (attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * (attempt + 1)),
        );
        continue;
      }
      fail(503, 'Сервис поиска мест перегружен. Попробуй немного позже.');
    }
    if (!res.ok) fail(502, 'Не удалось получить описание места');
    const data = await res.json();
    if (data.error) {
      if (/busy|ratelimit|readonly|maxlag/i.test(data.error.code || '')) {
        if (language === 'ru' && params.list === 'geosearch')
          fail(503, 'Сервис поиска мест перегружен. Попробуй немного позже.');
        if (attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 500 * (attempt + 1)),
          );
          continue;
        }
        fail(503, 'Сервис поиска мест перегружен. Попробуй немного позже.');
      }
      fail(502, 'Сервис поиска мест не смог обработать запрос.');
    }
    return data;
  }
  fail(503, 'Сервис поиска мест временно недоступен. Попробуй немного позже.');
}

type NearbyPlace = {
  pageid: number;
  title: string;
  lat: number;
  lon: number;
  dist: number;
};
const attractionCache = new MemoryCache<
  number,
  { expires: number; allowed: boolean }
>();
async function filterAttractions(places: NearbyPlace[]) {
  const candidates = places.filter(
    (place) => !clearlyNotAttraction(place.title),
  );
  const unknown = candidates.filter(
    (place) =>
      !obviousAttraction(place.title) &&
      (!attractionCache.has(place.pageid) ||
        attractionCache.get(place.pageid)!.expires < Date.now()),
  );
  if (unknown.length) {
    const data = await wiki({
      pageids: unknown.map((place) => place.pageid).join('|'),
      prop: 'categories|pageterms',
      cllimit: '500',
      clshow: '!hidden',
      wbptterms: 'description',
    });
    for (const place of unknown) {
      const page = data.query?.pages?.[place.pageid];
      const allowed = page
        ? isAttraction({ ...page, title: place.title })
        : false;
      if (attractionCache.size >= 2000)
        attractionCache.delete(attractionCache.keys().next().value!);
      attractionCache.set(place.pageid, {
        expires: Date.now() + CACHE_TTL,
        allowed,
      });
    }
  }
  return candidates.filter(
    (place) =>
      obviousAttraction(place.title) ||
      attractionCache.get(place.pageid)?.allowed,
  );
}
let russianGeoPausedUntil = 0;
async function searchNearby(lat: number, lon: number): Promise<NearbyPlace[]> {
  const params = {
    list: 'geosearch',
    gscoord: lat + '|' + lon,
    gsradius: '2100',
    gslimit: '50',
  };
  if (Date.now() >= russianGeoPausedUntil) {
    try {
      const data = await wiki(params);
      return data.query?.geosearch || [];
    } catch {
      russianGeoPausedUntil = Date.now() + 60000;
    }
  }
  const data = await wiki(params, 'en');
  const nearby = (data.query?.geosearch || []) as NearbyPlace[];
  if (!nearby.length) return [];
  const links = await wiki(
    {
      pageids: nearby.map((page) => page.pageid).join('|'),
      prop: 'langlinks',
      lllang: 'ru',
      lllimit: '500',
    },
    'en',
  );
  const titles = [
    ...new Set(
      Object.values(links.query?.pages || {})
        .flatMap((page: any) =>
          (page.langlinks || [])
            .filter((link: any) => link.lang === 'ru')
            .map((link: any) => link['*'] || link.title),
        )
        .filter(Boolean),
    ),
  ] as string[];
  if (!titles.length) return [];
  const russian = await wiki({
    titles: titles.join('|'),
    redirects: '1',
    prop: 'coordinates|categories|pageterms',
    colimit: 'max',
    cllimit: '500',
    clshow: '!hidden',
    wbptterms: 'description',
  });
  return Object.values(russian.query?.pages || {}).flatMap((page: any) => {
    const position = page.coordinates?.find(
      (coordinate: any) => !coordinate.globe || coordinate.globe === 'earth',
    );
    if (
      !position ||
      !Number.isFinite(position.lat) ||
      !Number.isFinite(position.lon) ||
      page.missing !== undefined
    )
      return [];
    attractionCache.set(page.pageid, {
      expires: Date.now() + CACHE_TTL,
      allowed: isAttraction(page),
    });
    return [
      {
        pageid: page.pageid,
        title: page.title,
        lat: position.lat,
        lon: position.lon,
        dist: distanceMeters(lat, lon, position.lat, position.lon),
      },
    ];
  });
}
const nearbyCache = new MemoryCache<
  string,
  { expires: number; result: Promise<NearbyPlace[]> }
>();
export async function nearby(
  lat: number,
  lon: number,
  beforeFetch?: () => void,
) {
  const centerLat = Number(lat.toFixed(3)),
    centerLon = Number(lon.toFixed(3));
  const key = centerLat + ':' + centerLon;
  let cached = nearbyCache.get(key);
  if (!cached || cached.expires < Date.now()) {
    beforeFetch?.();
    const result = searchNearby(centerLat, centerLon).then(filterAttractions);
    cached = { expires: Date.now() + CACHE_TTL, result };
    if (nearbyCache.size >= 1000)
      nearbyCache.delete(nearbyCache.keys().next().value!);
    nearbyCache.set(key, cached);
    void result.catch(() => {
      if (nearbyCache.get(key)?.result === result) nearbyCache.delete(key);
    });
  }
  return (await cached.result)
    .map((place) => ({
      ...place,
      dist: distanceMeters(lat, lon, place.lat, place.lon),
    }))
    .filter((place) => place.dist <= 2000)
    .sort((a, b) => a.dist - b.dist);
}
const summaryCache = new MemoryCache<number, Promise<any>>();
export async function placeSummary(
  pageId: number,
  origin?: { lat: number; lon: number },
) {
  let pending = summaryCache.get(pageId);
  if (!pending) {
    pending = wiki({
      pageids: String(pageId),
      prop: 'extracts|info|coordinates|pageterms',
      wbptterms: 'description',
      coprimary: 'all',
      colimit: 'max',
      exintro: '1',
      explaintext: '1',
      inprop: 'url',
    });
    summaryCache.set(pageId, pending);
    void pending.catch(() => {
      if (summaryCache.get(pageId) === pending) summaryCache.delete(pageId);
    });
  }
  const data = await pending;
  const p = data.query?.pages?.[pageId];
  let position: { lat: number; lon: number; distance: number } | undefined;
  if (origin) {
    position = (p?.coordinates || [])
      .filter(
        (c: any) =>
          (!c.globe || c.globe === 'earth') &&
          Number.isFinite(c.lat) &&
          Number.isFinite(c.lon),
      )
      .map((c: any) => ({
        lat: c.lat,
        lon: c.lon,
        distance: distanceMeters(origin.lat, origin.lon, c.lat, c.lon),
      }))
      .sort((a: any, b: any) => a.distance - b.distance)[0];
    if (!position || position.distance > 2000)
      fail(400, 'Место должно находиться рядом с фотографией');
  }
  if (!p?.extract) fail(404, 'У этого места пока нет описания');
  const text = placeTextContent(String(p.extract), p.terms?.description?.[0]);
  textCache.set(pageId, {
    expires: Date.now() + CACHE_TTL,
    result: Promise.resolve(text),
  });
  return {
    ...position,
    title: String(p.title),
    summary: text.summary,
    url: 'https://ru.wikipedia.org/?curid=' + pageId,
  };
}

const imageCache = new MemoryCache<
  string,
  { expires: number; image: string | null }
>();
function wikiImageUrl(source: unknown): string | null {
  if (typeof source !== 'string') return null;
  try {
    const url = new URL(source);
    if (
      url.protocol === 'https:' &&
      ['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
    )
      return url.href;
  } catch {}
  return null;
}
export async function placeImage(pageId: number, language = 'ru') {
  const cached = imageCache.get(language + ':' + pageId);
  if (cached && cached.expires > Date.now()) return cached.image;
  const data = await wiki(
    {
      pageids: String(pageId),
      prop: 'pageimages|images',
      piprop: 'thumbnail',
      pithumbsize: '800',
      pilicense: 'free',
      imlimit: '20',
    },
    language,
  );
  const page = data.query?.pages?.[pageId];
  let image = wikiImageUrl(page?.thumbnail?.source);
  if (!image) {
    const titles: string[] = (page?.images || [])
      .map((item: { title: string }) => item.title)
      .filter(
        (title: string) =>
          /\.(jpe?g|png|webp)$/i.test(title) &&
          !/flag|logo|coat.?of.?arms|icon|флаг|герб|логотип/i.test(title),
      )
      .slice(0, 8);
    if (titles.length) {
      const files = await wiki(
        {
          titles: titles.join('|'),
          prop: 'imageinfo',
          iiprop: 'url|size|mime',
          iiurlwidth: '800',
        },
        language,
      );
      const pages = Object.values(files.query?.pages || {}) as any[];
      for (const title of titles) {
        const file = pages.find((item) => item.title === title),
          info = file?.imageinfo?.[0];
        // Commons files are freely reusable; do not fall back to local fair-use files.
        if (
          file?.imagerepository !== 'shared' ||
          !['image/jpeg', 'image/png', 'image/webp'].includes(info?.mime) ||
          info.width < 300 ||
          info.height < 180
        )
          continue;
        image = wikiImageUrl(info.thumburl || info.url);
        if (image) break;
      }
    }
  }
  if (imageCache.size > 1000) imageCache.clear();
  imageCache.set(language + ':' + pageId, {
    image,
    expires: Date.now() + CACHE_TTL,
  });
  return image;
}

const textCache = new MemoryCache<
  number,
  { expires: number; result: Promise<{ summary: string; description: string }> }
>();
export async function placeText(pageId: number) {
  const cached = textCache.get(pageId);
  if (cached && cached.expires > Date.now()) return cached.result;
  const result = wiki({
    pageids: String(pageId),
    prop: 'extracts|pageterms',
    exintro: '1',
    explaintext: '1',
    wbptterms: 'description',
  }).then((data) => {
    const page = data.query?.pages?.[pageId];
    if (!page?.extract) fail(404, 'У этого места пока нет описания');
    return placeTextContent(String(page.extract), page.terms?.description?.[0]);
  });
  if (textCache.size >= 1000) textCache.delete(textCache.keys().next().value!);
  textCache.set(pageId, { expires: Date.now() + CACHE_TTL, result });
  void result.catch(() => {
    if (textCache.get(pageId)?.result === result) textCache.delete(pageId);
  });
  return result;
}
