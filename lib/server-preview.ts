import { dirname, join } from 'node:path';
import sharp from 'sharp';
import {
  DiskPreviewCache,
  MAX_PREVIEW_BYTES,
  PREVIEW_TYPES,
  previewKey,
  type PreviewImage,
} from './disk-preview-cache';
import { fetchPreview } from './yandex';
import { fail } from './access';
import type { Row } from './db';

const cache = new DiskPreviewCache(
  process.env.PREVIEW_CACHE_DIRECTORY ||
    join(
      dirname(process.env.DATABASE_PATH || './data/travel.sqlite'),
      'preview-cache-v1',
    ),
);

export function closePreviewCache() {
  cache.close();
}

type Job = {
  controller: AbortController;
  promise: Promise<PreviewImage>;
  readers: number;
};

const jobs = new Map<string, Job>();

let active = 0;

const waiting: (() => void)[] = [];

export class PreviewTooLarge extends Error {}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', aborted));
  });
}

async function slot<T>(
  signal: AbortSignal,
  task: () => Promise<T>,
): Promise<T> {
  while (active >= 4) {
    await new Promise<void>((resolve, reject) => {
      const resume = () => {
        signal.removeEventListener('abort', aborted);
        resolve();
      };
      const aborted = () => {
        const index = waiting.indexOf(resume);
        if (index >= 0) waiting.splice(index, 1);
        reject(signal.reason);
      };
      signal.throwIfAborted();
      waiting.push(resume);
      signal.addEventListener('abort', aborted, { once: true });
    });
  }
  if (signal.aborted) {
    waiting.shift()?.();
    signal.throwIfAborted();
  }
  active++;
  try {
    return await task();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

async function load(
  media: Row,
  refresh: boolean,
  signal: AbortSignal,
): Promise<PreviewImage> {
  const response = await fetchPreview(media, signal, refresh);
  if (!response.ok) {
    await response.body?.cancel();
    fail(
      response.status === 404 ? 404 : 502,
      'messages.theFileIsUnavailableOnDrive',
    );
  }
  const contentType = (response.headers.get('content-type') || '')
    .split(';')[0]
    .toLowerCase();
  if (!PREVIEW_TYPES.has(contentType)) {
    await response.body?.cancel();
    fail(502, 'messages.yandexDidNotReturnAPreviewImage');
  }
  if (Number(response.headers.get('content-length') || 0) > MAX_PREVIEW_BYTES) {
    await response.body?.cancel();
    throw new PreviewTooLarge();
  }
  const reader = response.body?.getReader();
  if (!reader) fail(502, 'messages.yandexDidNotReturnAPreviewImage');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_PREVIEW_BYTES) throw new PreviewTooLarge();
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return { body: Buffer.concat(chunks), contentType };
}

export async function serverPreview(
  media: Row,
  signal?: AbortSignal,
  refresh = false,
) {
  signal?.throwIfAborted();
  const key = previewKey(media);
  if (!refresh) {
    const hit = await cache.get(key);
    signal?.throwIfAborted();
    if (hit) return { ...hit, cacheStatus: 'hit' };
  }
  let job = jobs.get(key);
  const shared = !!job;
  if (!job) {
    if (jobs.size >= 32) fail(503, 'messages.previewUnavailable');
    const controller = new AbortController();
    const deadline = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(18000),
    ]);
    job = { controller, promise: undefined!, readers: 0 };
    const entry = job;
    job.promise = slot(deadline, async () => {
      const image = await load(media, refresh, deadline);
      // Do not retain an error page or a damaged/unsupported image in the server cache.
      let valid = false;
      try {
        await sharp(image.body, {
          limitInputPixels: 8000000,
          failOn: 'warning',
          sequentialRead: true,
        })
          .resize(1, 1, { fit: 'inside' })
          .toBuffer();
        valid = true;
      } catch {
        /* The existing client validation still handles a damaged upstream image. */
      }
      deadline.throwIfAborted();
      if (valid) await cache.put(key, image);
      return image;
    }).finally(() => {
      if (jobs.get(key) === entry) jobs.delete(key);
    });
    jobs.set(key, job);
    void job.promise.catch(() => {});
  }
  job.readers++;
  try {
    const image = await withAbort(job.promise, signal);
    return { ...image, cacheStatus: shared ? 'shared' : 'miss' };
  } finally {
    job.readers--;
    if (!job.readers) job.controller.abort();
  }
}

export const previewCacheStats = () => cache.stats();
