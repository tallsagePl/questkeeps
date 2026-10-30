import { dirname, join } from 'node:path';
import { createWriteStream, statfsSync } from 'node:fs';
import { rename, unlink } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { one } from './db';
import { fetchMedia } from './yandex';
import {
  VideoStore,
  videoKey,
  VIDEO_INPUT_LIMIT,
  VIDEO_SCRATCH,
} from './video-store';
import { convertVideo, VideoFailure } from './video-convert';

let store: VideoStore | undefined;

let recovered = false;

export function videoStore() {
  return (store ||= new VideoStore(
    process.env.VIDEO_CACHE_DIRECTORY ||
      join(
        dirname(
          /* turbopackIgnore: true */ process.env.DATABASE_PATH ||
            './data/travel.sqlite',
        ),
        'video-cache-v1',
      ),
  ));
}

export function closeVideoStore() {
  store?.close();
  store = undefined;
  recovered = false;
}

export async function runVideoJob(signal: AbortSignal) {
  const cache = videoStore();
  cache.tick();
  if (recovered && !cache.next()) return;
  const unlock = cache.workerLock();
  if (!unlock) return;
  let key: string | undefined;
  try {
    cache.recover();
    recovered = true;
    const job = cache.next();
    if (!job) return;
    key = job.key;
    const media = one(
      'SELECT m.*,s.account_id,a.disk_enabled FROM media m JOIN sources s ON s.id=m.source_id JOIN accounts a ON a.id=s.account_id WHERE m.id=? AND m.missing=0',
      job.media_id,
    );
    if (!media || !media.disk_enabled || videoKey(media) !== key)
      throw new VideoFailure('video.failed');
    cache.reserve();
    const disk = statfsSync(cache.directory);
    if (disk.bavail * disk.bsize < VIDEO_SCRATCH + 64 * 1024 * 1024)
      throw new VideoFailure('video.storageBusy');
    cache.stage(key, 'download');
    const download = AbortSignal.any([signal, AbortSignal.timeout(120000)]);
    const response = await fetchMedia(media, false, null, download);
    if (!response.ok || !response.body) throw new VideoFailure('video.failed');
    const length = Number(response.headers.get('content-length') || 0);
    if (length > VIDEO_INPUT_LIMIT) {
      await response.body.cancel();
      throw new VideoFailure('video.tooLarge');
    }
    let bytes = 0;
    const bound = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        callback(
          bytes > VIDEO_INPUT_LIMIT ? new VideoFailure('video.tooLarge') : null,
          chunk,
        );
      },
    });
    await pipeline(
      Readable.fromWeb(
        response.body as import('node:stream/web').ReadableStream<Uint8Array>,
      ),
      bound,
      createWriteStream(cache.file(key, 'input'), { flags: 'wx', mode: 0o600 }),
      { signal: download },
    );
    cache.stage(key, 'encode');
    await convertVideo(
      cache.file(key, 'input'),
      cache.file(key, 'working.mp4'),
      cache.file(key, 'working.jpg'),
      signal,
    );
    const current = one(
      'SELECT m.*,s.account_id,a.disk_enabled FROM media m JOIN sources s ON s.id=m.source_id JOIN accounts a ON a.id=s.account_id WHERE m.id=? AND m.missing=0',
      job.media_id,
    );
    if (!current?.disk_enabled || videoKey(current) !== key)
      throw new VideoFailure('video.failed');
    await rename(cache.file(key, 'working.mp4'), cache.file(key, 'mp4'));
    await rename(cache.file(key, 'working.jpg'), cache.file(key, 'jpg'));
    cache.ready(key);
  } catch (error) {
    if (key && signal.aborted) cache.requeue(key);
    else if (key)
      cache.failed(
        key,
        error instanceof VideoFailure ? error.key : 'video.failed',
      );
    if (!signal.aborted)
      console.warn('Video preparation failed', {
        reason: error instanceof VideoFailure ? error.key : 'video.failed',
      });
  } finally {
    if (key)
      for (const suffix of ['input', 'working.mp4', 'working.jpg'] as const)
        await unlink(cache.file(key, suffix)).catch(() => {});
    if (key && cache.job(key)?.state !== 'ready')
      for (const suffix of ['mp4', 'jpg'] as const)
        await unlink(cache.file(key, suffix)).catch(() => {});
    unlock();
  }
}
