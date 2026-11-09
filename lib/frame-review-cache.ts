import { opaqueCacheRequest } from './browser-storage';
import type { FrameSignature } from './frame-review';

const prefix = 'questkeeps-frame-review-v1-';

const ttl = 90 * 24 * 60 * 60 * 1000;

const maxEntriesPerShard = 7000;

const pruneEveryWrites = 256;

const algorithmVersion = 'rgb-samples-8x8-4bit-v2';

const sampledBytes = (8 * 8 * 3) / 2;

type CachedFrame = { colors: string; detail: number };

type CachedSignature = {
  savedAt: number;
  expiresAt: number;
  id: string;
  revision: string;
  kind: 'photo' | 'video';
  pixels: number;
  frames: CachedFrame[];
  duration?: number;
};

export type CachedGroups = {
  savedAt: number;
  expiresAt: number;
  kind: 'photo' | 'video';
  sourceFingerprint: string;
  groups: { id: string; pixels: number; revision: string }[][];
  skipped: number;
  total: number;
};

export type FrameReviewMediaRef = {
  id: string;
  revision?: string | null;
  kind: string;
};

type Shard = { cache: Cache; entries: number; writes: number };

const shards = new Map<string, Promise<Shard>>();

let generation = 0;

function toBase64(bytes: Uint8ClampedArray) {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8ClampedArray(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function prune(cache: Cache) {
  const requests = await cache.keys();
  const now = Date.now();
  const valid: { request: Request; savedAt: number }[] = [];
  await Promise.all(
    requests.map(async (request) => {
      const response = await cache.match(request);
      const expiresAt = Number(response?.headers.get('X-QK-Expires') || 0);
      if (!response || expiresAt <= now) {
        await cache.delete(request);
        return;
      }
      valid.push({
        request,
        savedAt: Number(response.headers.get('X-QK-Saved-At') || 0),
      });
    }),
  );
  if (valid.length > maxEntriesPerShard) {
    valid.sort((first, second) => first.savedAt - second.savedAt);
    await Promise.all(
      valid
        .slice(0, valid.length - maxEntriesPerShard)
        .map(({ request }) => cache.delete(request)),
    );
  }
  return Math.min(valid.length, maxEntriesPerShard);
}

async function shardFor(scope: string, key: string) {
  const namespace = await digest(scope);
  const name = prefix + namespace + '-' + key[0];
  let pending = shards.get(name);
  if (!pending) {
    pending = caches.open(name).then(async (cache) => ({
      cache,
      entries: await prune(cache),
      writes: 0,
    }));
    shards.set(name, pending);
    pending.catch(() => shards.delete(name));
  }
  return pending;
}

async function cacheKey(kind: 'photo' | 'video', id: string, revision: string) {
  return digest(JSON.stringify([algorithmVersion, kind, id, revision]));
}

export async function frameReviewSourceFingerprint(
  items: FrameReviewMediaRef[],
) {
  const source = items.map(
    ({ id, revision, kind }): [string, string, string] => [
      id,
      revision || '1',
      kind,
    ],
  );
  source.sort(
    (first, second) =>
      first[0].localeCompare(second[0]) ||
      first[1].localeCompare(second[1]) ||
      first[2].localeCompare(second[2]),
  );
  return digest(JSON.stringify(source));
}

async function resultRequest(
  kind: 'photo' | 'video',
  sourceFingerprint: string,
) {
  const key = await cacheKey(kind, '__groups__', 'result:' + sourceFingerprint);
  return {
    key,
    request: await opaqueCacheRequest('/__questkeeps_frame_review__/' + key),
  };
}

export async function getFrameReviewGroups(
  userId: string,
  tripId: string,
  kind: 'photo' | 'video',
  sourceFingerprint: string,
): Promise<CachedGroups | null | undefined> {
  if (typeof caches === 'undefined') return null;
  const currentGeneration = generation;
  try {
    const { key, request } = await resultRequest(kind, sourceFingerprint);
    const { cache } = await shardFor(userId + ':' + tripId, key);
    if (generation !== currentGeneration) return null;
    const response = await cache.match(request);
    if (!response) return;
    if (Number(response.headers.get('X-QK-Expires') || 0) <= Date.now()) {
      await cache.delete(request);
      return;
    }
    const saved = (await response.json()) as CachedGroups;
    if (
      saved.kind !== kind ||
      saved.sourceFingerprint !== sourceFingerprint ||
      !Number.isFinite(saved.savedAt) ||
      !Array.isArray(saved.groups) ||
      !Number.isFinite(saved.skipped) ||
      !Number.isFinite(saved.total) ||
      saved.groups.some(
        (group) =>
          !Array.isArray(group) ||
          group.some(
            (item) =>
              typeof item.id !== 'string' ||
              !Number.isFinite(item.pixels) ||
              typeof item.revision !== 'string',
          ),
      )
    ) {
      await cache.delete(request);
      return;
    }
    return saved;
  } catch {
    return null;
  }
}

export async function putFrameReviewGroups(
  userId: string,
  tripId: string,
  kind: 'photo' | 'video',
  sourceFingerprint: string,
  groups: { id: string; pixels: number; revision: string }[][],
  skipped: number,
  total: number,
) {
  if (typeof caches === 'undefined') return;
  const currentGeneration = generation;
  try {
    const { key, request } = await resultRequest(kind, sourceFingerprint);
    const { cache } = await shardFor(userId + ':' + tripId, key);
    if (generation !== currentGeneration) return;
    const now = Date.now();
    const saved: CachedGroups = {
      savedAt: now,
      expiresAt: now + ttl,
      kind,
      sourceFingerprint,
      groups,
      skipped,
      total,
    };
    const exists = await cache.match(request);
    await cache.put(
      request,
      new Response(JSON.stringify(saved), {
        headers: {
          'Content-Type': 'application/json',
          'X-QK-Saved-At': String(now),
          'X-QK-Expires': String(now + ttl),
        },
      }),
    );
    if (generation !== currentGeneration) {
      await cache.delete(request);
      return;
    }
    const shard = await shardFor(userId + ':' + tripId, key);
    if (!exists) shard.entries++;
    if (
      ++shard.writes >= pruneEveryWrites ||
      shard.entries > maxEntriesPerShard
    ) {
      shard.entries = await prune(cache);
      shard.writes = 0;
    }
  } catch {
    // Restoring the last result is a convenience; media signatures remain authoritative.
  }
}

export async function getFrameReviewSignature(
  userId: string,
  tripId: string,
  kind: 'photo' | 'video',
  id: string,
  revision: string,
): Promise<Omit<FrameSignature, 'favorite' | 'id'> | undefined> {
  if (typeof caches === 'undefined') return;
  const currentGeneration = generation;
  try {
    const key = await cacheKey(kind, id, revision);
    const { cache } = await shardFor(userId + ':' + tripId, key);
    if (generation !== currentGeneration) return;
    const request = await opaqueCacheRequest(
      '/__questkeeps_frame_review__/' + key,
    );
    const response = await cache.match(request);
    if (!response) return;
    const expiresAt = Number(response.headers.get('X-QK-Expires') || 0);
    if (expiresAt <= Date.now()) {
      await cache.delete(request);
      return;
    }
    const saved = (await response.json()) as CachedSignature;
    if (
      saved.id !== id ||
      saved.revision !== revision ||
      saved.kind !== kind ||
      !Number.isFinite(saved.pixels) ||
      !Array.isArray(saved.frames) ||
      saved.frames.length !== (kind === 'photo' ? 1 : 3)
    ) {
      await cache.delete(request);
      return;
    }
    const frames = saved.frames.map(({ colors, detail }) => ({
      colors: fromBase64(colors),
      detail,
    }));
    if (
      frames.some(
        (frame) =>
          frame.colors.length !== sampledBytes ||
          !Number.isFinite(frame.detail),
      )
    ) {
      await cache.delete(request);
      return;
    }
    return {
      pixels: saved.pixels,
      duration: saved.duration,
      frames,
    };
  } catch {
    return;
  }
}

export async function putFrameReviewSignature(
  userId: string,
  tripId: string,
  kind: 'photo' | 'video',
  revision: string,
  signature: Omit<FrameSignature, 'favorite'>,
) {
  if (typeof caches === 'undefined') return;
  const currentGeneration = generation;
  try {
    const key = await cacheKey(kind, signature.id, revision);
    const { cache } = await shardFor(userId + ':' + tripId, key);
    if (generation !== currentGeneration) return;
    const request = await opaqueCacheRequest(
      '/__questkeeps_frame_review__/' + key,
    );
    const now = Date.now();
    const saved: CachedSignature = {
      savedAt: now,
      expiresAt: now + ttl,
      id: signature.id,
      revision,
      kind,
      pixels: signature.pixels,
      frames: signature.frames.map(({ colors, detail }) => ({
        colors: toBase64(colors),
        detail,
      })),
      duration: signature.duration,
    };
    const exists = await cache.match(request);
    await cache.put(
      request,
      new Response(JSON.stringify(saved), {
        headers: {
          'Content-Type': 'application/json',
          'X-QK-Saved-At': String(now),
          'X-QK-Expires': String(now + ttl),
        },
      }),
    );
    if (generation !== currentGeneration) {
      await cache.delete(request);
      return;
    }
    const shard = await shardFor(userId + ':' + tripId, key);
    if (!exists) shard.entries++;
    if (
      ++shard.writes >= pruneEveryWrites ||
      shard.entries > maxEntriesPerShard
    ) {
      shard.entries = await prune(cache);
      shard.writes = 0;
    }
  } catch {
    // Local persistence is optional; the current scan still works without it.
  }
}

export async function clearFrameReviewCache() {
  generation++;
  shards.clear();
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(prefix))
      .map((name) => caches.delete(name)),
  );
}
