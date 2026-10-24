'use client';

import { useEffect } from 'react';
import { useLocale } from './appearance';
import { previewBlob } from '../lib/preview-cache';
import { queuePreview } from '../lib/preview-queue';
import {
  startBackgroundTasks,
  type BackgroundTask,
} from '../lib/background-tasks';
import {
  cachedPlaceDescription,
  cachedAreaWiki,
  cachedPlaceInfo,
  cachedPlaceImage,
  cachedMapGeometry,
  cachedMapSuggestions,
} from '../lib/place-client-cache';
import { searchPhotoPlaces } from '../lib/place-search-client';
import { isAreaPlace } from '../lib/place-kind';
import { queuePlaceDescription } from '../lib/place-description-queue';

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
  mapScope,
  userId,
  guest = false,
  share,
}: {
  data: Row;
  scope: string;
  mapScope: string;
  userId?: string;
  guest?: boolean;
  share?: string;
}) {
  const { language } = useLocale();
  useEffect(() => {
    const controller = new AbortController();
    const path = (id: string, kind: string) =>
      '/api/media/' + id + '/' + kind + (share ? '?share=' + share : '');
    const media = (data.media || []).filter(
      (m: Row) => !m.hidden && !m.missing,
    );
    const previews: BackgroundTask[] = [];
    for (let i = 0; i < media.length; i += 2) {
      const pair = media.slice(i, i + 2);
      previews.push({
        run: () =>
          Promise.all(
            pair.map(async (m: Row) => {
              const src =
                path(m.id, 'preview') +
                (share ? '&' : '?') +
                'revision=' +
                encodeURIComponent(m.revision || '1');
              const work = queuePreview(scope + ':' + src, 2, (signal) =>
                previewBlob(src, scope, signal),
              );
              const cancel = () => work.release();
              controller.signal.addEventListener('abort', cancel, {
                once: true,
              });
              try {
                await work.promise;
              } finally {
                work.release();
                controller.signal.removeEventListener('abort', cancel);
              }
            }),
          ),
      });
    }
    const description = (endpoint: string) =>
      queuePlaceDescription(
        () => cachedPlaceDescription(endpoint, scope, language, 2),
        controller.signal,
        2,
      );
    const metadata: BackgroundTask[] = [];
    const seen = new Set<string>();
    for (const place of data.places || []) {
      if (seen.has(place.url)) continue;
      seen.add(place.url);
      const imagePath = path(place.media_id, 'places/' + place.id + '/image');
      metadata.push({
        run: async () => {
          await description(imagePath.replace('/image', '/text'));
          const image = await cachedPlaceInfo(imagePath, scope, language, 2);
          if (image.image) await cachedPlaceImage(image.image, scope, 2);
        },
      });
      if (isAreaPlace(place.title, place.summary))
        metadata.push({
          run: () =>
            cachedMapGeometry(
              path(place.media_id, 'places/' + place.id + '/geometry'),
              mapScope,
              2,
            ),
        });
    }
    const searchable = guest
      ? []
      : media.filter(
          (m: Row) =>
            m.kind === 'photo' &&
            Number.isFinite(m.lat) &&
            Number.isFinite(m.lon) &&
            (data.trip.role === 'owner' || m.user_id === userId),
        );
    // Interleave nearby-place searches with confirmed-place resources.
    const interleaved: BackgroundTask[] = [];
    for (let i = 0; i < Math.max(metadata.length, searchable.length); i++) {
      if (metadata[i]) interleaved.push(metadata[i]);
      if (searchable[i]) {
        const photo = searchable[i];
        interleaved.push({
          run: async () => {
            const result = await searchPhotoPlaces(
              photo as any,
              scope,
              data.trip.id,
            );
            if (controller.signal.aborted) return;
            window.dispatchEvent(
              new CustomEvent('questkeeps:place-search-updated', {
                detail: data.trip.id,
              }),
            );
            return result.suggestions.map((suggestion) => ({
              run: () =>
                description(
                  '/api/media/' +
                    photo.id +
                    '/places/description?pageId=' +
                    suggestion.pageid,
                ),
            }));
          },
        });
      }
    }
    const stops = [
      startBackgroundTasks(previews, controller.signal),
      startBackgroundTasks(interleaved, controller.signal),
    ];
    if (!guest)
      stops.push(
        startBackgroundTasks(
          [
            {
              run: async () => {
                const result = await cachedMapSuggestions(
                  '/api/trips/' + data.trip.id + '/area-suggestions',
                  mapScope,
                  2,
                );
                if (result.incomplete) throw Error('Map discovery incomplete');
                return result.candidates.map((candidate: any) => ({
                  run: async () => {
                    const info = await cachedAreaWiki(
                      '/api/trips/' +
                        data.trip.id +
                        '/area-suggestions/' +
                        candidate.id +
                        '/wiki?lang=' +
                        language +
                        '&v=4',
                      scope,
                      2,
                    );
                    if (info.image)
                      await cachedPlaceImage(info.image, scope, 2);
                  },
                }));
              },
            },
          ],
          controller.signal,
        ),
      );
    return () => {
      controller.abort();
      stops.forEach((stop) => stop());
    };
  }, [data, mapScope, scope, userId, guest, share, language]);
  return null;
}
