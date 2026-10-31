import { tripCovers, coverSettings } from '../trip-covers';
import type { TripSummary } from '../contracts';
import {
  ensureUsername,
  descriptionMentions,
  resolveMentions,
} from '../profiles';
import { areaWiki } from '../map-area-wiki';
import { areaSuggestions, addAreaToPhotos } from '../map-area-suggestions';
import { z } from 'zod';
import { db, one, all, run, id } from '../db';
import { fail, membership, owner, tripData, throttle } from '../access';
import { disk } from '../yandex';
import { queueSourceSync, sourceJobStatus } from '../source-jobs';
import { inferTrip, ownFolder } from '../infer-trip';
import { json, body, day } from './http';
import type { AuthenticatedContext } from './context';
import { collaborationRoutes } from './collaboration';

export async function tripRoutes({
  req,
  p,
  method,
  url,
  u,
  background,
}: AuthenticatedContext): Promise<Response | undefined> {
  if (p[0] === 'trips' && p[1] === 'infer' && method === 'POST') {
    const input = z
      .object({
        accountId: z.string().min(1),
        path: z.string().max(4096),
        dates: z.boolean(),
        destination: z.boolean(),
        language: z.enum(['ru', 'en']).default('ru'),
      })
      .refine((v) => v.dates || v.destination, 'messages.chooseWhatToDetect')
      .parse(await body(req));
    throttle('infer:' + u.id, 12);
    return json(await inferTrip(u.id, input, req.signal));
  }
  if (p[0] === 'trips') {
    if (!p[1]) {
      if (method === 'GET')
        return json({
          trips: all<TripSummary>(
            'SELECT DISTINCT t.id,t.title,t.destination,t.start,t.end,t.description,(SELECT count(*) FROM media m JOIN sources s ON s.id=m.source_id WHERE m.trip_id=t.id AND m.hidden=0 AND m.missing=0 AND s.approved=1 AND (t.owner_id=? OR mb.all_photos=1 OR substr(m.taken,1,10) BETWEEN mb.start AND mb.end)) media_count FROM trips t LEFT JOIN members mb ON mb.trip_id=t.id AND mb.user_id=? AND mb.active=1 WHERE t.owner_id=? OR mb.user_id=? ORDER BY t.created DESC',
            u.id,
            u.id,
            u.id,
            u.id,
          ).map((trip) => ({ ...trip, covers: tripCovers(trip.id, u.id) })),
        });
      if (method === 'POST') {
        const input = z
          .object({
            title: z.string().trim().min(1).max(120),
            destination: z.string().trim().min(1).max(1000),
            description: z.string().max(3000).default(''),
            start: day,
            end: day,
            source: z
              .object({ accountId: z.string(), path: z.string().max(4096) })
              .optional(),
          })
          .refine(
            (x) => x.start <= x.end,
            'messages.endDateIsEarlierThanTheStart',
          )
          .parse(await body(req));
        let selectedFolder: string | undefined;
        if (input.source) {
          selectedFolder = ownFolder(
            u.id,
            input.source.accountId,
            input.source.path,
          );
          const meta = await disk(input.source.accountId, 'resources', {
            path: selectedFolder,
            limit: '0',
          });
          if (meta.type !== 'dir')
            fail(400, 'messages.chooseAFolderWithPhotos');
        }
        const tid = id();
        const sourceId = input.source ? id() : null;
        db.transaction(() => {
          run(
            'INSERT INTO trips(id,owner_id,title,destination,start,end,description,created) VALUES (?,?,?,?,?,?,?,?)',
            tid,
            u.id,
            input.title,
            input.destination,
            input.start,
            input.end,
            input.description,
            Date.now(),
          );
          if (input.source && sourceId) {
            run(
              'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,1)',
              sourceId,
              tid,
              u.id,
              input.source.accountId,
              selectedFolder,
            );
            queueSourceSync(sourceId, false);
          }
        })();
        return json({ id: tid, sourceId }, 201);
      }
    }
    const tid = p[1];

    if (p[2] === 'cover' && !p[3]) {
      const trip = owner(tid, u.id);
      if (method === 'GET') return json(coverSettings(tid));
      if (method === 'PATCH') {
        const input = z
          .object({
            mode: z.enum(['all', 'selected']),
            photoIds: z.array(z.string().min(1).max(100)).max(5),
            positions: z
              .record(
                z.string().min(1).max(100),
                z
                  .object({
                    x: z.number().min(0).max(100),
                    y: z.number().min(0).max(100),
                  })
                  .strict(),
              )
              .refine((value) => Object.keys(value).length <= 5)
              .optional(),
          })
          .strict()
          .parse(await body(req));
        const ids = [...new Set(input.photoIds)];
        const positions = input.positions || {};
        if (
          Object.keys(positions).some(
            (id) => input.mode !== 'selected' || !ids.includes(id),
          )
        )
          fail(400, 'tripCover.invalidCrop');
        if (input.mode === 'selected' && !ids.length)
          fail(400, 'tripCover.choosePhoto');
        db.transaction(() => {
          if (input.mode === 'selected')
            for (const photoId of ids) {
              if (
                !one(
                  `SELECT 1 FROM media m JOIN sources s ON s.id=m.source_id JOIN media_favorites f ON f.media_id=m.id AND f.user_id=? WHERE m.id=? AND m.trip_id=? AND m.kind='photo' AND m.hidden=0 AND m.missing=0 AND s.approved=1 AND substr(m.taken,1,10) BETWEEN ? AND ?`,
                  u.id,
                  photoId,
                  tid,
                  trip.start,
                  trip.end,
                )
              )
                fail(400, 'tripCover.unavailable');
            }
          run(
            'INSERT INTO trip_cover_settings(trip_id,mode,photo_ids) VALUES (?,?,?) ON CONFLICT(trip_id) DO UPDATE SET mode=excluded.mode,photo_ids=excluded.photo_ids',
            tid,
            input.mode,
            JSON.stringify(input.mode === 'all' ? [] : ids),
          );
          for (const [mediaId, position] of Object.entries(positions))
            run(
              'INSERT INTO trip_cover_positions(trip_id,media_id,x,y) VALUES (?,?,?,?) ON CONFLICT(trip_id,media_id) DO UPDATE SET x=excluded.x,y=excluded.y',
              tid,
              mediaId,
              position.x,
              position.y,
            );
        })();
        return json(coverSettings(tid));
      }
    }
    if (!p[2] && method === 'GET') return json(tripData(req, tid));
    if (!p[2] && method === 'PATCH') {
      owner(tid, u.id);
      const input = z
        .object({
          description: z.string().max(3000),
          mentions: z
            .array(
              z
                .object({
                  start: z.number().int().nonnegative(),
                  end: z.number().int().positive(),
                  userId: z.string().min(1).max(100),
                })
                .strict(),
            )
            .max(100)
            .optional(),
        })
        .strict()
        .parse(await body(req));
      const description = input.description.trim();
      const leading =
        input.description.length - input.description.trimStart().length;
      const previous = one('SELECT description FROM trips WHERE id=?', tid)!;
      const mentions = (
        input.mentions ||
        (previous.description === description
          ? descriptionMentions(tid, description)
          : [])
      )
        .map((m) => ({
          ...m,
          start: m.start - (input.mentions ? leading : 0),
          end: m.end - (input.mentions ? leading : 0),
        }))
        .sort((a, b) => a.start - b.start);
      let end = 0;
      for (const m of mentions) {
        if (
          m.start < end ||
          m.start < 0 ||
          m.end <= m.start ||
          m.end > description.length ||
          !description.slice(m.start, m.end).trim() ||
          /[\r\n]/.test(description.slice(m.start, m.end))
        )
          fail(400, 'errors.singleLineMention');
        if (!one('SELECT 1 FROM users WHERE id=?', m.userId))
          fail(400, 'tripDescription.userNotFound');
        ensureUsername(m.userId);
        end = m.end;
      }
      const linkedMentions = resolveMentions(description, mentions);
      db.transaction(() => {
        run('UPDATE trips SET description=? WHERE id=?', description, tid);
        run('DELETE FROM trip_description_mentions WHERE trip_id=?', tid);
        for (const m of linkedMentions)
          run(
            'INSERT INTO trip_description_mentions VALUES (?,?,?,?)',
            tid,
            m.start,
            m.end,
            m.userId,
          );
      })();
      return json({
        description,
        descriptionMentions: descriptionMentions(tid, description),
      });
    }
    if (p[2] === 'sync' && !p[3]) {
      const trip = membership(tid, u.id);
      if (method === 'GET')
        return json(sourceJobStatus(tid, u.id, trip.role === 'owner'));
      if (method === 'POST') {
        throttle('trip-sync:' + tid + ':' + u.id, 3);
        const sources = all(
          'SELECT id FROM sources WHERE trip_id=? AND approved=1 AND (?=1 OR user_id=?)',
          tid,
          Number(trip.role === 'owner'),
          u.id,
        );
        let queued = 0;
        let failed = 0;
        for (const source of sources) {
          try {
            queueSourceSync(source.id);
            queued++;
          } catch {
            failed++;
          }
        }
        return json({ queued, failed }, 202);
      }
    }
    if (p[2] === 'area-suggestions') {
      membership(tid, u.id);
      if (method === 'GET' && p[3] && p[4] === 'wiki')
        return json(
          await areaWiki(
            tid,
            p[3],
            url.searchParams.get('lang') === 'en' ? 'en' : 'ru',
          ),
        );
      if (method === 'GET') return json(await areaSuggestions(tid, u.id));
      if (method === 'POST') {
        const input = z
          .object({
            areaId: z.string().regex(/^osm-(?:way|relation)-[1-9][0-9]*$/),
          })
          .parse(await body(req));
        return json(addAreaToPhotos(tid, u.id, input.areaId));
      }
    }
    if (p[2] === 'places' && p[3] && method === 'DELETE') {
      owner(tid, u.id);
      const osm = /^osm-(way|relation)-([1-9][0-9]*)$/.exec(p[3]);
      const url = osm
        ? 'https://www.openstreetmap.org/' + osm[1] + '/' + osm[2]
        : 'https://ru.wikipedia.org/?curid=' +
          z.coerce.number().int().positive().parse(p[3]);
      const result = run(
        'DELETE FROM confirmed_places WHERE trip_id=? AND url=?',
        tid,
        url,
      );
      if (!result.changes) fail(404, 'messages.placeNotFound');
      return json({ ok: true });
    }
    const result = await collaborationRoutes(
      { req, p, method, url, u, background },
      tid,
    );
    if (result) return result;
  }
}
