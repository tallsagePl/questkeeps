'use client';

import { useEffect, useRef } from 'react';
import { previewBlob } from '../lib/preview-cache';
import { queuePreview } from '../lib/preview-queue';
import { startBackgroundTasks } from '../lib/background-tasks';

type Row = Record<string, any>;

export function tripMapScope(data: Row, scope: string) {
  // Access and photo revisions delimit private resources. Adding a place does not invalidate other map data.
  const text = JSON.stringify([
    data.trip.id,
    data.trip.role,
    data.trip.from,
    data.trip.to,
    (data.media || []).map((m: Row) => [
      m.id,
      m.revision,
      m.hidden,
      m.lat,
      m.lon,
    ]),
  ]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return scope + ':trip-map:' + data.trip.id + ':' + (hash >>> 0).toString(36);
}

export default function TripPreloader({
  data,
  scope,
  share,
}: {
  data: Row;
  scope: string;
  mapScope: string;
  userId?: string;
  guest?: boolean;
  share?: string;
}) {
  const done = useRef(new Set<string>());
  const identity = useRef(scope);
  const connection =
    typeof navigator === 'undefined'
      ? undefined
      : (
          navigator as Navigator & {
            connection?: { saveData?: boolean; effectiveType?: string };
          }
        ).connection;
  const low =
    connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '');
  const limit = low
    ? 0
    : typeof window !== 'undefined' && innerWidth < 700
      ? 6
      : 12;
  const media = (data.media || [])
    .filter((m: Row) => !m.hidden && !m.missing)
    .slice(0, limit);
  const key = JSON.stringify([
    scope,
    share,
    media.map((m: Row) => [m.id, m.revision]),
  ]);
  useEffect(() => {
    if (identity.current !== scope) {
      done.current.clear();
      identity.current = scope;
    }
    const controller = new AbortController();
    let bytes = 0;
    const until = Date.now() + 15000;
    const tasks = media.map((m: Row) => ({
      run: async () => {
        if (bytes >= 6 * 1024 * 1024 || Date.now() > until) return;
        const src =
          '/api/media/' +
          encodeURIComponent(m.id) +
          '/preview?' +
          new URLSearchParams({
            revision: m.revision || '1',
            size: 'card',
            ...(share ? { share } : {}),
          });
        if (done.current.has(src)) return;
        const work = queuePreview(scope + ':' + src, 2, (signal) =>
          previewBlob(src, scope, signal),
        );
        const cancel = () => work.release();
        controller.signal.addEventListener('abort', cancel, { once: true });
        try {
          const blob = await work.promise;
          bytes += blob.size;
          done.current.add(src);
          while (done.current.size > 32)
            done.current.delete(done.current.values().next().value!);
        } finally {
          work.release();
          controller.signal.removeEventListener('abort', cancel);
        }
      },
    }));
    const stop = startBackgroundTasks(tasks, controller.signal);
    return () => {
      controller.abort();
      stop();
    };
  }, [key]);
  return null;
}
