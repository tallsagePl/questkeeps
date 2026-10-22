import { opaqueCacheRequest } from './browser-storage';
import {
  queuePlaceResource,
  promotePlaceResource,
} from './place-resource-queue';
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
const prefix = 'questkeeps-place-resources-v4-';
const memory = new MemoryCache<string, Promise<unknown>>();
const stores = new MemoryCache<string, Promise<Cache | null>>();
let generation = 0;
const priorities = new Map<string, number>();
const freshUntil = new Map<string, number>();
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
          Number(value?.headers.get('X-QuestKeeps-Expires') || 0) <
          Date.now() - 7 * 86400000
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
  ttl: number | ((data: T) => number) = CACHE_TTL,
  allowStale = false,
  priority = 0,
): Promise<T> {
  const key = scope + ':' + endpoint;
  const existing = memory.get(key);
  if (existing && (freshUntil.get(key) ?? Infinity) > Date.now()) {
    priorities.set(key, Math.min(priorities.get(key) ?? priority, priority));
    if (priority === 0) promotePlaceResource(key);
    return existing as Promise<T>;
  }
  priorities.set(key, priority);
  if (existing) memory.delete(key);
  freshUntil.delete(key);
  const version = generation;
  const pending = (async () => {
    const cache = await store(scope),
      request = await opaqueCacheRequest(endpoint);
    const saved = await cache?.match(request).catch(() => undefined);
    let stale: T | undefined;
    if (saved) {
      try {
        const decoded = await decode(saved.clone());
        if (valid(decoded)) {
          const expires = Number(
            saved.headers.get('X-QuestKeeps-Expires') || 0,
          );
          if (expires > Date.now()) {
            freshUntil.set(key, expires);
            return decoded;
          }
          if (allowStale) stale = decoded;
        }
      } catch {
        await cache?.delete(request).catch(() => {});
      }
    }
    const refresh = async (background = false): Promise<T> => {
      const value = await queuePlaceResource(
        load,
        background ? 2 : (priorities.get(key) ?? priority),
        key,
      );
      if (!valid(value)) {
        memory.delete(key);
        return value;
      }
      // An incomplete provider response must not erase a previously downloaded contour.
      if (
        stale !== undefined &&
        ((value as any).incomplete ||
          ((stale as any).features?.length && !(value as any).features?.length))
      ) {
        freshUntil.set(key, Date.now() + 30000);
        return stale;
      }
      const expires =
        Date.now() + (typeof ttl === 'function' ? ttl(value) : ttl);
      if (generation === version) {
        freshUntil.set(key, expires);
        if (cache) {
          const response = encode(value);
          response.headers.set('X-QuestKeeps-Expires', String(expires));
          await cache.put(request, response).catch(() => {});
        }
      }
      return value;
    };
    if (stale !== undefined) {
      freshUntil.set(key, Date.now() + 30000);
      void refresh(true)
        .then((value) => {
          if (generation !== version) return;
          memory.set(key, Promise.resolve(value));
          if (typeof window !== 'undefined')
            window.dispatchEvent(
              new CustomEvent('questkeeps:map-resource-updated', {
                detail: { endpoint, scope },
              }),
            );
        })
        .catch((error) => {
          if ([401, 403, 404].includes(error?.status)) {
            memory.delete(key);
            freshUntil.delete(key);
            void cache?.delete(request);
          }
        });
      return stale;
    }
    return refresh();
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
  timeout = 20000,
): Promise<T> {
  const response = await fetch(endpoint, {
    credentials: 'same-origin',
    headers: { 'X-QuestKeeps-Language': language },
    signal: AbortSignal.timeout(timeout),
    cache: 'no-store',
  });
  if (!response.ok)
    throw Object.assign(new Error('Place unavailable'), {
      status: response.status,
    });
  return response.json();
}
export const cachedPlaceInfo = (
  endpoint: string,
  scope = '',
  language = currentLanguage(),
  priority = 0,
) =>
  cached(
    endpoint,
    scope + ':article-v1:' + language,
    () => json<PlaceInfo>(endpoint, language),
    (value) => Response.json(value),
    (response) => response.json(),
    (value) => !!value.image,
    86400000,
    false,
    priority,
  );
export const cachedPlaceDescription = (
  endpoint: string,
  scope = '',
  language = currentLanguage(),
  priority = 0,
) =>
  cached(
    endpoint,
    scope + ':article-v1:' + language,
    () => json<PlaceText>(endpoint, language),
    (value) => Response.json(value),
    (response) => response.json(),
    (value) => !!value.description || value.available === false,
    86400000,
    false,
    priority,
  );
export const cachedPlaceImage = (src: string, scope = '', priority = 0) =>
  cached(
    src,
    scope,
    async () => {
      const response = await fetch(src, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        mode: 'cors',
        signal: AbortSignal.timeout(20000),
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
    86400000,
    false,
    priority,
  );
export async function clearPlaceClientCache() {
  generation++;
  memory.clear();
  freshUntil.clear();
  priorities.clear();
  stores.clear();
  if (typeof caches !== 'undefined')
    await Promise.all(
      (await caches.keys())
        .filter((name) => name.startsWith('questkeeps-place-resources-'))
        .map((name) => caches.delete(name)),
    );
}

export const cachedAreaWiki = (endpoint: string, scope = '', priority = 0) =>
  cached(
    endpoint,
    scope,
    () => json<import('./map-area-wiki').AreaWiki>(endpoint),
    (value) => Response.json(value),
    (response) => response.json(),
    () => true,
    86400000,
    false,
    priority,
  );

export const cachedMapGeometry = (endpoint: string, scope = '', priority = 0) =>
  cached<any>(
    endpoint,
    scope + ':map-v1',
    () => json(endpoint),
    (value) => Response.json(value),
    (r) => r.json(),
    (value) => Array.isArray(value?.features),
    (value) => (value.features.length ? 86400000 : 30000),
    true,
    priority,
  );
export const cachedMapSuggestions = (
  endpoint: string,
  scope = '',
  priority = 0,
) =>
  cached<any>(
    endpoint,
    scope + ':map-v1',
    () => json(endpoint, currentLanguage(), 120000),
    (value) => Response.json(value),
    (r) => r.json(),
    (value) => Array.isArray(value?.candidates),
    (value) => (value.incomplete ? 30000 : CACHE_TTL),
    true,
    priority,
  );
export async function invalidateMapResource(endpoint: string, scope: string) {
  const namespace = scope + ':map-v1';
  const key = namespace + ':' + endpoint;
  memory.delete(key);
  freshUntil.delete(key);
  const cache = await store(namespace);
  await cache?.delete(await opaqueCacheRequest(endpoint)).catch(() => {});
}
