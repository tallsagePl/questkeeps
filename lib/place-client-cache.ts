import { queuePlaceResource } from './place-resource-queue';
import { MemoryCache, CACHE_TTL } from './memory-cache';
type PlaceInfo = { image: string | null };
export type PlaceText = {
  description: string;
  summary: string;
  title?: string;
  url?: string | null;
  available?: boolean;
  language?: string;
};
const prefix = 'questkeeps-place-resources-v3-';
const memory = new MemoryCache<string, Promise<unknown>>();
const stores = new MemoryCache<string, Promise<Cache | null>>();
let generation = 0;
async function store(scope: string) {
  if (typeof caches === 'undefined') return null;
  let pending = stores.get(scope);
  if (pending) return pending;
  pending = (async () => {
    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(scope),
    );
    const name =
      prefix +
      Array.from(new Uint8Array(hash), (n) =>
        n.toString(16).padStart(2, '0'),
      ).join('');
    const cache = await caches.open(name);
    await Promise.all(
      (await cache.keys()).map(async (key) => {
        const value = await cache.match(key);
        if (
          Number(value?.headers.get('X-QuestKeeps-Expires') || 0) <= Date.now()
        )
          await cache.delete(key);
      }),
    );
    return cache;
  })().catch(() => null);
  stores.set(scope, pending);
  return pending;
}
async function cached<T>(
  endpoint: string,
  scope: string,
  load: () => Promise<T>,
  encode: (data: T) => Response,
  decode: (res: Response) => Promise<T>,
  valid: (data: T) => boolean,
): Promise<T> {
  const key = scope + ':' + endpoint;
  const existing = memory.get(key);
  if (existing) return existing as Promise<T>;
  const version = generation;
  const pending = (async () => {
    const cache = await store(scope),
      request = new Request(new URL(endpoint, location.origin));
    const saved = await cache?.match(request).catch(() => undefined);
    if (
      saved &&
      Number(saved.headers.get('X-QuestKeeps-Expires') || 0) > Date.now()
    )
      return decode(saved);
    if (saved) await cache?.delete(request);
    const value = await queuePlaceResource(load);
    if (!valid(value)) {
      memory.delete(key);
      return value;
    }
    if (cache && generation === version) {
      const response = encode(value);
      response.headers.set(
        'X-QuestKeeps-Expires',
        String(Date.now() + CACHE_TTL),
      );
      await cache.put(request, response).catch(() => {});
    }
    return value;
  })();
  memory.set(key, pending);
  void pending.catch(() => {
    if (memory.get(key) === pending) memory.delete(key);
  });
  return pending;
}
const currentLanguage = () =>
  typeof document !== 'undefined' && document.documentElement.lang === 'en'
    ? 'en'
    : 'ru';
async function json<T>(
  endpoint: string,
  language = currentLanguage(),
): Promise<T> {
  const response = await fetch(endpoint, {
    credentials: 'same-origin',
    headers: { 'X-QuestKeeps-Language': language },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Place unavailable');
  return response.json();
}
export const cachedPlaceInfo = (
  endpoint: string,
  scope = '',
  language = currentLanguage(),
) =>
  cached(
    endpoint,
    scope + ':article-v1:' + language,
    () => json<PlaceInfo>(endpoint, language),
    (value) => Response.json(value),
    (response) => response.json(),
    (value) => !!value.image,
  );
export const cachedPlaceDescription = (
  endpoint: string,
  scope = '',
  language = currentLanguage(),
) =>
  cached(
    endpoint,
    scope + ':article-v1:' + language,
    () => json<PlaceText>(endpoint, language),
    (value) => Response.json(value),
    (response) => response.json(),
    (value) => !!value.description || value.available === false,
  );
export const cachedPlaceImage = (src: string, scope = '') =>
  cached(
    src,
    scope,
    async () => {
      const response = await fetch(src, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        mode: 'cors',
        cache: 'no-store',
      });
      if (
        !response.ok ||
        !response.headers.get('content-type')?.startsWith('image/')
      )
        throw new Error('Image unavailable');
      const blob = await response.blob(),
        url = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
      } finally {
        URL.revokeObjectURL(url);
      }
      return blob;
    },
    (blob) => new Response(blob, { headers: { 'Content-Type': blob.type } }),
    (response) => response.blob(),
    () => true,
  );
export async function clearPlaceClientCache() {
  generation++;
  memory.clear();
  stores.clear();
  if (typeof caches !== 'undefined')
    await Promise.all(
      (await caches.keys())
        .filter((name) => name.startsWith(prefix))
        .map((name) => caches.delete(name)),
    );
}

export const cachedAreaWiki = (endpoint: string, scope = '') =>
  cached(
    endpoint,
    scope,
    () => json<import('./map-area-wiki').AreaWiki>(endpoint),
    (value) => Response.json(value),
    (response) => response.json(),
    () => true,
  );
