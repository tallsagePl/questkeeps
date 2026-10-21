import { CACHE_TTL } from './memory-cache';
import { clearPlaceClientCache } from './place-client-cache';
// Only preview images are persisted; originals and video streams never enter this cache.
const prefix = 'questkeeps-previews-v1-';
let generation = 0;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pruned = new Set<string>();
function expire(cache: Cache, request: Request, key: string, at: number) {
  const previous = timers.get(key);
  if (previous) clearTimeout(previous);
  timers.set(
    key,
    setTimeout(
      () => {
        void cache.delete(request);
        timers.delete(key);
      },
      Math.max(0, at - Date.now()),
    ),
  );
}
async function cacheFor(scope: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(scope),
  );
  const name =
    prefix +
    Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
  const cache = await caches.open(name);
  if (!pruned.has(name)) {
    pruned.add(name);
    await Promise.all(
      (await cache.keys()).map(async (request) => {
        const saved = await cache.match(request);
        const at = Number(saved?.headers.get('X-QuestKeeps-Expires') || 0);
        if (at <= Date.now()) await cache.delete(request);
      }),
    );
  }
  return cache;
}
export async function clearPreviewCache() {
  generation++;
  await clearPlaceClientCache();
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
  pruned.clear();
  if (typeof caches !== 'undefined') {
    await Promise.all(
      (await caches.keys())
        .filter((n) => n.startsWith(prefix))
        .map((n) => caches.delete(n)),
    );
  }
}
export async function discardPreview(src: string, scope: string) {
  const request = new Request(new URL(src, location.origin));
  const key = scope + request.url;
  const timer = timers.get(key);
  if (timer) clearTimeout(timer);
  timers.delete(key);
  if (typeof caches !== 'undefined') {
    const cache = await cacheFor(scope).catch(() => null);
    await cache?.delete(request).catch(() => {});
  }
}
async function validatePreview(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function previewBlob(
  src: string,
  scope: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const currentGeneration = generation;
  const cache =
    typeof caches !== 'undefined'
      ? await cacheFor(scope).catch(() => null)
      : null;
  const request = new Request(new URL(src, location.origin));
  const saved = await cache?.match(request).catch(() => undefined);
  signal?.throwIfAborted();
  if (saved) {
    const at = Number(saved.headers.get('X-QuestKeeps-Expires') || 0);
    if (at > Date.now()) {
      try {
        const blob = await saved.blob();
        await validatePreview(blob);
        signal?.throwIfAborted();
        if (cache) expire(cache, request, scope + request.url, at);
        return blob;
      } catch (error) {
        signal?.throwIfAborted();
        // A damaged cached response is not a successful preview: fetch it afresh.
      }
    }
    await cache?.delete(request);
  }
  const response = await fetch(src, {
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  });
  if (
    !response.ok ||
    !response.headers.get('content-type')?.startsWith('image/')
  )
    throw new Error('Preview unavailable');
  const blob = await response.blob();
  // Do not persist broken images or an error page returned with a successful status.
  await validatePreview(blob);
  signal?.throwIfAborted();
  if (cache && generation === currentGeneration) {
    await cache
      .put(
        request,
        new Response(blob, {
          headers: {
            'Content-Type': blob.type,
            'X-QuestKeeps-Expires': String(Date.now() + CACHE_TTL),
          },
        }),
      )
      .catch(() => {});
    expire(cache, request, scope + request.url, Date.now() + CACHE_TTL);
  }
  return blob;
}
