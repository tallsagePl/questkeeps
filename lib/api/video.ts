import { open } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { currentUser, fail, mediaFor, throttle } from '../access';
import { hash, one } from '../db';
import { ownProfileMedia } from '../profile-media';
import { videoStore } from '../video-jobs';
import { videoKey } from '../video-store';
import { json } from './http';
import type { RequestContext } from './context';

export function videoRange(
  raw: string | null,
  size: number,
): [number, number] | null {
  if (!raw) return [0, size - 1];
  const match = /^bytes=(\d*)-(\d*)$/.exec(raw);
  if (!match || (!match[1] && !match[2])) return null;
  let from: number;
  let to: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    from = Math.max(0, size - suffix);
    to = size - 1;
  } else {
    from = Number(match[1]);
    to = match[2] ? Number(match[2]) : size - 1;
  }
  if (
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(to) ||
    from < 0 ||
    from >= size ||
    to < from
  )
    return null;
  return [from, Math.min(to, size - 1)];
}

export async function videoRoutes({ req, p, method }: RequestContext) {
  const access = () => {
    const m =
      p[0] === 'my-media' ? ownProfileMedia(req, p[1]) : mediaFor(req, p[1]);
    if (m.kind !== 'video') fail(404, 'video.unsupported');
    const a = one(
      'SELECT disk_enabled,token FROM accounts WHERE id=?',
      m.account_id,
    );
    if (!a?.disk_enabled || !a.token)
      fail(409, 'messages.yandexAccountDisconnectedReconnectItInYour');
    return m;
  };
  const m = access();
  const key = videoKey(m);
  const cache = videoStore();
  if (p[2] === 'playback-status' && method === 'GET') {
    const job = cache.status(key);
    return json({
      state: job?.state || 'idle',
      stage: job?.stage || '',
      message: job?.error || null,
    });
  }
  if (p[2] === 'playback' && method === 'POST') {
    if (!cache.alive()) fail(503, 'video.storageBusy');
    const old = cache.status(key);
    if (!old || old.state === 'error')
      throttle(
        'video:' +
          hash(
            currentUser(req)?.id || req.headers.get('x-real-ip') || 'unknown',
          ),
        10,
        5 * 60000,
      );
    try {
      const job = cache.enqueue(key, m.id);
      return json(
        { state: job.state, stage: job.stage, message: job.error },
        job.state === 'ready' ? 200 : 202,
      );
    } catch {
      fail(503, 'video.storageBusy');
    }
  }
  if (
    !['GET', 'HEAD'].includes(method) ||
    !['playback', 'poster'].includes(p[2])
  )
    fail(405, 'messages.methodNotSupported');
  const lease = cache.lease(key);
  if (!lease) fail(409, 'video.notReady');
  const fd = await open(
    cache.file(key, p[2] === 'poster' ? 'jpg' : 'mp4'),
    'r',
  ).catch((error) => {
    lease.release();
    throw error;
  });
  try {
    if (videoKey(access()) !== key) fail(409, 'video.notReady');
  } catch (error) {
    await fd.close();
    lease.release();
    throw error;
  }
  const size = (
    await fd.stat().catch(async (error) => {
      await fd.close();
      lease.release();
      throw error;
    })
  ).size;
  const range =
    method === 'GET' && p[2] === 'playback' ? req.headers.get('range') : null;
  const span = videoRange(range, size);
  const headers = new Headers({
    'Content-Type': p[2] === 'poster' ? 'image/jpeg' : 'video/mp4',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
  });
  if (!span) {
    await fd.close();
    lease.release();
    headers.set('Content-Range', 'bytes */' + size);
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Length', String(span[1] - span[0] + 1));
  if (range)
    headers.set('Content-Range', `bytes ${span[0]}-${span[1]}/${size}`);
  if (method === 'HEAD') {
    await fd.close();
    lease.release();
    return new Response(null, { headers });
  }
  const stream = fd.createReadStream({
    start: span[0],
    end: span[1],
    autoClose: true,
  });
  const stop = () => stream.destroy();
  const timer = setInterval(() => {
    try {
      lease.renew();
    } catch {
      stop();
    }
  }, 20000);
  timer.unref();
  req.signal.addEventListener('abort', stop, { once: true });
  stream.once('close', () => {
    clearInterval(timer);
    req.signal.removeEventListener('abort', stop);
    try {
      lease.release();
    } catch {}
  });
  if (req.signal.aborted) stop();
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    status: range ? 206 : 200,
    headers,
  });
}
