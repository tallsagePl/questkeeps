import { videoRoutes } from './video';
import { ownProfileMedia } from '../profile-media';
import { localizedWikiArticle } from '../wiki-article';
import { areaWiki } from '../map-area-wiki';
import { osmAreaId } from '../map-area-suggestions';
import { z } from 'zod';
import { db, one, run, id } from '../db';
import {
  fail,
  requireUser,
  membership,
  assertDay,
  mediaFor,
  throttle,
} from '../access';
import { fetchMedia } from '../yandex';
import { serverPreview, PreviewTooLarge } from '../server-preview';
import { nearby, placeSummary, placeImage, placeText } from '../places';
import { placeTextContent } from '../place-text';
import { placeGeometry } from '../place-geometry';
import { json, body } from './http';
import type { RequestContext } from './context';

export async function mediaRoutes({
  req,
  p,
  method,
}: RequestContext): Promise<Response | undefined> {
  if (
    ['media', 'my-media'].includes(p[0]) &&
    p[1] &&
    ['playback', 'playback-status', 'poster'].includes(p[2]) &&
    !p[3]
  )
    return videoRoutes({ req, p, method, url: req.nextUrl });
  if (
    (p[0] === 'media' && p[1]) ||
    (p[0] === 'my-media' &&
      p[1] &&
      method === 'GET' &&
      ['preview', 'original', 'download'].includes(p[2]) &&
      !p[3])
  ) {
    if (
      method === 'GET' &&
      p[2] === 'places' &&
      p[3] &&
      ['image', 'text', 'geometry'].includes(p[4])
    ) {
      const m = mediaFor(req, p[1]);
      const place =
        one(
          'SELECT url,title,summary FROM confirmed_places WHERE id=? AND media_id=? AND trip_id=?',
          p[3],
          m.id,
          m.trip_id,
        ) || fail(404, 'messages.placeNotFound');
      const articleLanguage = req.headers.get('X-QuestKeeps-Language');
      const osmId = osmAreaId(place.url);
      if (osmId) {
        const area =
          one('SELECT * FROM map_areas WHERE id=?', osmId) ||
          fail(404, 'messages.placeNotFound');
        if (p[4] === 'geometry') return json(JSON.parse(area.geometry));
        if (articleLanguage && p[4] !== 'geometry') {
          const info = await areaWiki(
            m.trip_id,
            osmId,
            articleLanguage === 'en' ? 'en' : 'ru',
          );
          return json(
            p[4] === 'image'
              ? { image: info.image }
              : { ...info, summary: info.description, available: !!info.url },
          );
        }
        if (p[4] === 'text')
          return json({ description: area.summary, summary: area.summary });
        return json({ image: null });
      }
      const pageId = Number(new URL(place.url).searchParams.get('curid'));
      if (!Number.isSafeInteger(pageId) || pageId <= 0)
        return json({ image: null });
      if (articleLanguage && p[4] !== 'geometry') {
        const info = await localizedWikiArticle(
          pageId,
          articleLanguage === 'en' ? 'en' : 'ru',
        );
        return json(
          p[4] === 'image'
            ? {
                image: info.pageId
                  ? await placeImage(info.pageId, info.language, req.signal)
                  : null,
              }
            : info,
        );
      }
      if (p[4] === 'image')
        return json({ image: await placeImage(pageId, 'ru', req.signal) });
      if (p[4] === 'geometry')
        return json(await placeGeometry(pageId, place.title, place.summary));
      const existing = placeTextContent(place.summary || '');
      if (existing.description) return json(existing);
      const text = await placeText(pageId);
      run(
        'UPDATE confirmed_places SET summary=? WHERE url=?',
        text.summary,
        place.url,
      );
      return json(text);
    }

    if (
      method === 'GET' &&
      ['preview', 'original', 'download'].includes(p[2])
    ) {
      const m =
        p[0] === 'my-media' ? ownProfileMedia(req, p[1]) : mediaFor(req, p[1]);
      const range = req.headers.get('range');
      if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))
        fail(416, 'messages.invalidRange');
      const checkAccount = () => {
        const account = one(
          'SELECT disk_enabled,token FROM accounts WHERE id=?',
          m.account_id,
        );
        if (!account?.disk_enabled || !account.token)
          fail(409, 'messages.yandexAccountDisconnectedReconnectItInYour');
      };
      if (p[2] === 'preview' && !range) {
        checkAccount();
        try {
          const image = await serverPreview(
            m,
            req.signal,
            new URL(req.url).searchParams.has('reload'),
          );
          // Permissions may have changed while a shared download was in progress.
          if (p[0] === 'my-media') ownProfileMedia(req, p[1]);
          else mediaFor(req, p[1]);
          checkAccount();
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(image.body);
              controller.close();
            },
          });
          return new Response(stream, {
            headers: {
              'Content-Type': image.contentType,
              'Content-Length': String(image.body.length),
              'Cache-Control': 'private, no-store',
              'X-Content-Type-Options': 'nosniff',
              'Content-Security-Policy': "sandbox; default-src 'none'",
              'X-QuestKeeps-Preview-Cache': image.cacheStatus,
            },
          });
        } catch (error) {
          if (req.signal.aborted) return new Response(null, { status: 499 });
          if (error instanceof Error && error.name === 'TimeoutError')
            fail(504, 'errors.requestTimedOut');
          // Unusually large previews retain their original streaming path, without disk caching.
          if (!(error instanceof PreviewTooLarge)) throw error;
        }
      }
      const r = await fetchMedia(
        m,
        p[2] === 'preview',
        range,
        req.signal,
        new URL(req.url).searchParams.has('reload'),
      );
      // A seek may finish after a membership, guest link or account is revoked.
      try {
        if (p[0] === 'my-media') ownProfileMedia(req, p[1]);
        else mediaFor(req, p[1]);
        checkAccount();
      } catch (error) {
        await r.body?.cancel();
        throw error;
      }
      if (r.status === 416) {
        await r.body?.cancel();
        const headers = new Headers({ 'Cache-Control': 'private, no-store' });
        for (const name of ['content-range', 'accept-ranges'])
          if (r.headers.has(name)) headers.set(name, r.headers.get(name)!);
        return new Response(null, { status: 416, headers });
      }
      if (!r.ok && r.status !== 206)
        fail(
          r.status === 404 ? 404 : 502,
          'messages.theFileIsUnavailableOnDrive',
        );
      const previewType = (r.headers.get('content-type') || '')
        .split(';')[0]
        .toLowerCase();
      if (
        p[2] === 'preview' &&
        ![
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/avif',
          'image/gif',
        ].includes(previewType)
      ) {
        await r.body?.cancel();
        fail(502, 'messages.yandexDidNotReturnAPreviewImage');
      }
      const headers = new Headers({
        'Cache-Control': 'private, no-store',
        'Content-Type': p[2] === 'preview' ? previewType : m.mime,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
      });
      for (const h of ['content-length', 'content-range', 'accept-ranges'])
        if (r.headers.has(h)) headers.set(h, r.headers.get(h)!);
      headers.set(
        'Content-Disposition',
        (p[2] === 'download' ? 'attachment' : 'inline') +
          "; filename*=UTF-8''" +
          encodeURIComponent(m.name),
      );
      return new Response(r.body, { status: r.status, headers });
    }
    const u = requireUser(req);
    const m =
      one('SELECT * FROM media WHERE id=?', p[1]) ||
      fail(404, 'messages.fileNotFound');
    if (p[2] === 'favorite' && method === 'PATCH') {
      const access = membership(m.trip_id, u.id);
      assertDay(m.taken.slice(0, 10), access);
      mediaFor(req, m.id);
      const input = z.object({ favorite: z.boolean() }).parse(await body(req));
      if (input.favorite)
        run(
          'INSERT OR IGNORE INTO media_favorites(user_id,media_id) VALUES (?,?)',
          u.id,
          m.id,
        );
      else
        run(
          'DELETE FROM media_favorites WHERE user_id=? AND media_id=?',
          u.id,
          m.id,
        );
      return json({ favorite: input.favorite });
    }
    if (method === 'DELETE' && !p[2]) {
      if (m.user_id !== u.id) fail(403, 'messages.youCanOnlyEditYourOwnPhotos');
      assertDay(m.taken.slice(0, 10), membership(m.trip_id, u.id));
      // Keep the exclusion independent of a source, so reconnecting a folder
      // cannot import this resource again. No request is sent to Yandex Disk.
      db.transaction(() => {
        run(
          'INSERT OR IGNORE INTO media_exclusions VALUES (?,?,?,?)',
          m.trip_id,
          u.id,
          m.resource_id,
          Date.now(),
        );
        const copies = db
          .prepare(
            'SELECT id FROM media WHERE trip_id=? AND user_id=? AND resource_id=?',
          )
          .all(m.trip_id, u.id, m.resource_id) as { id: string }[];
        for (const copy of copies) {
          for (const table of [
            'confirmed_places',
            'places',
            'media_titles',
            'media_favorites',
          ])
            run('DELETE FROM ' + table + ' WHERE media_id=?', copy.id);
          run('DELETE FROM media WHERE id=?', copy.id);
        }
      }).immediate();
      return json({ ok: true });
    }
    if (method === 'PATCH' && !p[2]) {
      if (m.user_id !== u.id) fail(403, 'messages.youCanOnlyEditYourOwnPhotos');
      const input = z
        .object({
          rotation: z
            .union([
              z.literal(0),
              z.literal(90),
              z.literal(180),
              z.literal(270),
            ])
            .optional(),
          title: z.string().trim().min(1).max(160).optional(),
          hidden: z.boolean().optional(),
          hiddenFromGuests: z.boolean().optional(),
          lat: z.number().min(-90).max(90).optional(),
          lon: z.number().min(-180).max(180).optional(),
        })
        .parse(await body(req));
      if (input.rotation !== undefined) {
        assertDay(m.taken.slice(0, 10), membership(m.trip_id, u.id));
        if (m.kind !== 'photo') fail(400, 'mediaArchive.photosOnly');
        run(
          'UPDATE media SET rotation=? WHERE trip_id=? AND user_id=? AND resource_id=?',
          input.rotation,
          m.trip_id,
          u.id,
          m.resource_id,
        );
      }
      if (input.title !== undefined) {
        assertDay(m.taken.slice(0, 10), membership(m.trip_id, u.id));
        mediaFor(req, m.id);
        run(
          'INSERT INTO media_titles(media_id,title) VALUES (?,?) ON CONFLICT(media_id) DO UPDATE SET title=excluded.title',
          m.id,
          input.title,
        );
      }
      if (input.hidden !== undefined || input.hiddenFromGuests !== undefined)
        run(
          'UPDATE media SET hidden=COALESCE(?,hidden),hidden_from_guests=COALESCE(?,hidden_from_guests) WHERE id=?',
          input.hidden === undefined ? null : Number(input.hidden),
          input.hiddenFromGuests === undefined
            ? null
            : Number(input.hiddenFromGuests),
          m.id,
        );
      if (input.lat !== undefined && input.lon !== undefined) {
        assertDay(m.taken.slice(0, 10), membership(m.trip_id, u.id));
        run(
          'UPDATE media SET lat=?,lon=? WHERE id=?',
          input.lat,
          input.lon,
          m.id,
        );
        run('DELETE FROM confirmed_places WHERE media_id=?', m.id);
      }
      return json({ ok: true });
    }
    if (p[2] === 'places') {
      const t = membership(m.trip_id, u.id);
      assertDay(m.taken.slice(0, 10), t);
      if (m.hidden || m.missing) fail(404, 'profileFiles.fileUnavailable');
      mediaFor(req, m.id);
      if (method === 'DELETE' && p[3]) {
        if (m.user_id !== u.id && t.role !== 'owner')
          fail(403, 'messages.onlyTheAuthorOrTripOwnerCan');
        const place =
          one(
            'SELECT id FROM confirmed_places WHERE id=? AND media_id=? AND trip_id=?',
            p[3],
            m.id,
            m.trip_id,
          ) || fail(404, 'messages.placeNotFound');
        run(
          'DELETE FROM confirmed_places WHERE id=? AND media_id=?',
          place.id,
          m.id,
        );
        return json({ ok: true });
      }
      if (m.lat === null || m.lon === null)
        fail(400, 'messages.thisPhotoHasNoCoordinates');
      if (method === 'GET' && p[3] === 'description') {
        const pageId = z.coerce
          .number()
          .int()
          .positive()
          .parse(new URL(req.url).searchParams.get('pageId'));
        throttle('place-description:' + u.id, 120, 60000);
        await placeSummary(pageId, { lat: m.lat, lon: m.lon });
        const language = req.headers.get('X-QuestKeeps-Language');
        return json(
          language
            ? await localizedWikiArticle(
                pageId,
                language === 'en' ? 'en' : 'ru',
              )
            : await placeText(pageId),
        );
      }
      if (method === 'GET') {
        return json({
          suggestions: await nearby(
            m.lat,
            m.lon,
            () => throttle('place-search:' + u.id, 120, 60000),
            new URL(req.url).searchParams.get('refresh') === '1',
          ),
        });
      }
      if (method === 'POST') {
        if (m.user_id !== u.id && t.role !== 'owner')
          fail(403, 'messages.onlyTheAuthorOrOwnerCanConfirm');
        const input = z
          .object({ pageId: z.number().int().positive() })
          .parse(await body(req));
        const summary = await placeSummary(input.pageId, {
          lat: m.lat,
          lon: m.lon,
        });
        const title = summary.title.slice(0, 160);
        db.transaction(() => {
          run(
            'INSERT INTO confirmed_places(id,trip_id,media_id,title,summary,url,lat,lon,day,distance) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(trip_id,media_id,url) DO UPDATE SET title=excluded.title,summary=excluded.summary,lat=excluded.lat,lon=excluded.lon,distance=excluded.distance',
            id(),
            m.trip_id,
            m.id,
            summary.title,
            summary.summary,
            summary.url,
            summary.lat,
            summary.lon,
            m.taken.slice(0, 10),
            summary.distance,
          );
          run(
            'INSERT INTO media_titles(media_id,title) VALUES (?,?) ON CONFLICT(media_id) DO UPDATE SET title=excluded.title',
            m.id,
            title,
          );
        })();
        return json({
          title,
          place: one(
            'SELECT * FROM confirmed_places WHERE trip_id=? AND media_id=? AND url=?',
            m.trip_id,
            m.id,
            summary.url,
          ),
        });
      }
    }
  }
}
