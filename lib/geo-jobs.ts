import { HttpError } from './access';
import { all, one, run, db, id, hash } from './db';
import {
  accessibleAreaPhotos,
  discoverPhotoRegion,
  buildAreaCandidates,
} from './map-area-suggestions';
import { photoSearchRegions } from './photo-search-regions';

type Compact = {
  id: string;
  title: string;
  originalTitle: string;
  kind: string;
  photoIds: string[];
  url: string;
};

function scope(tripId: string, userId: string) {
  const value = accessibleAreaPhotos(tripId, userId);
  const known = all(
    'SELECT id,url,title FROM confirmed_places WHERE trip_id=? ORDER BY id',
    tripId,
  );
  return {
    ...value,
    signature: hash(
      JSON.stringify([
        'geo-v1',
        value.trip.from,
        value.trip.to,
        value.trip.role,
        value.photos.map((p) => [p.id, p.lat, p.lon, p.revision, p.taken]),
        known,
      ]),
    ),
  };
}

export function queuedAreaSuggestions(tripId: string, userId: string) {
  const current = scope(tripId, userId);
  const now = Date.now();
  let job = one(
    'SELECT * FROM geo_jobs WHERE trip_id=? AND user_id=?',
    tripId,
    userId,
  );
  if (
    !job ||
    job.signature !== current.signature ||
    (job.state === 'ready' && job.updated < now - 6 * 3600000)
  ) {
    db.transaction(() => {
      run(
        'DELETE FROM geo_jobs WHERE lock_until<? AND (updated<? OR rowid IN (SELECT rowid FROM geo_jobs ORDER BY updated DESC LIMIT -1 OFFSET 63))',
        now,
        now - 7 * 86400000,
      );
      run(
        `INSERT INTO geo_jobs(trip_id,user_id,signature,updated) VALUES (?,?,?,?) ON CONFLICT(trip_id,user_id) DO UPDATE SET signature=excluded.signature,state='queued',result='[]',cursor=0,total=0,attempts=0,next_run=0,updated=excluded.updated`,
        tripId,
        userId,
        current.signature,
        now,
      );
    }).immediate();
    job = one(
      'SELECT * FROM geo_jobs WHERE trip_id=? AND user_id=?',
      tripId,
      userId,
    )!;
  }
  const candidates = JSON.parse(job!.result) as Compact[];
  const geometries = all(
    'SELECT id,geometry FROM map_areas WHERE id IN (SELECT value FROM json_each(?))',
    JSON.stringify(candidates.map((c) => c.id)),
  );
  const byId = new Map(geometries.map((g) => [g.id, g.geometry]));
  return {
    candidates: candidates
      .filter((c) => byId.has(c.id))
      .map((c) => ({ ...c, geometry: JSON.parse(byId.get(c.id)!) })),
    incomplete: job!.state !== 'ready',
    pending: ['queued', 'running'].includes(job!.state),
    progress: { done: job!.cursor, total: job!.total },
  };
}

let lastPublicPrune = 0;

function prunePublicGeography() {
  const now = Date.now();
  if (now - lastPublicPrune < 6 * 3600000) return;
  db.transaction(() => {
    run('DELETE FROM map_area_city_cache WHERE updated<?', now - 30 * 86400000);
    // Confirmed places and any current trip candidate protect their geometry.
    const stale = all(
      `SELECT id FROM map_areas a WHERE updated<?
      AND NOT EXISTS (SELECT 1 FROM trip_area_candidates c WHERE c.area_id=a.id)
      AND NOT EXISTS (SELECT 1 FROM confirmed_places p WHERE p.url=a.url)
      ORDER BY updated LIMIT 100`,
      now - 30 * 86400000,
    );
    const ids = JSON.stringify(stale.map((row) => row.id));
    for (const table of ['map_area_wiki', 'map_area_wiki_i18n'])
      run(
        'DELETE FROM ' +
          table +
          ' WHERE area_id IN (SELECT value FROM json_each(?))',
        ids,
      );
    run(
      'DELETE FROM map_areas WHERE id IN (SELECT value FROM json_each(?))',
      ids,
    );
  }).immediate();
  lastPublicPrune = now;
}

export async function runGeoJob(signal: AbortSignal) {
  prunePublicGeography();
  const now = Date.now();
  const lease = id();
  const job = db
    .transaction(() => {
      const row = one(
        "SELECT * FROM geo_jobs WHERE lock_until<? AND (state IN ('queued','running') OR state='error' AND next_run<=?) ORDER BY updated LIMIT 1",
        now,
        now,
      );
      if (row)
        run(
          "UPDATE geo_jobs SET state='running',lock_id=?,lock_until=? WHERE trip_id=? AND user_id=?",
          lease,
          now + 90000,
          row.trip_id,
          row.user_id,
        );
      return row;
    })
    .immediate();
  if (!job) return;
  try {
    const current = scope(job.trip_id, job.user_id);
    if (current.signature !== job.signature) {
      run(
        "UPDATE geo_jobs SET state='queued',signature=?,result='[]',cursor=0 WHERE trip_id=? AND user_id=? AND lock_id=?",
        current.signature,
        job.trip_id,
        job.user_id,
        lease,
      );
      return;
    }
    const active = AbortSignal.any([signal, AbortSignal.timeout(75000)]);
    const regions = photoSearchRegions(
      current.photos as { lat: number; lon: number }[],
    );
    run(
      'UPDATE geo_jobs SET total=? WHERE trip_id=? AND user_id=? AND lock_id=?',
      regions.length,
      job.trip_id,
      job.user_id,
      lease,
    );
    const ids = new Set<string>(
      (JSON.parse(job.result) as Compact[]).map((c) => c.id),
    );
    // One cell per lease lets a busy trip yield to other jobs and publish partial results.
    const region = regions[job.cursor];
    if (region) {
      const found = await discoverPhotoRegion(region, active);
      active.throwIfAborted();
      found.ids.forEach((value) => ids.add(value));
      if (found.incomplete) throw Error('Incomplete provider response');
    }
    const value = buildAreaCandidates(job.trip_id, current.photos, ids);
    const compact = value.candidates.map(
      ({ geometry, ...candidate }) => candidate,
    );
    const result = JSON.stringify(compact);
    if (Buffer.byteLength(result) > 2 * 1024 * 1024)
      throw Error('Geo result exceeds budget');
    if (scope(job.trip_id, job.user_id).signature !== job.signature) return;
    const cursor = Math.min(regions.length, job.cursor + 1);
    db.transaction(() => {
      run(
        `UPDATE geo_jobs SET result=?,cursor=?,state=?,attempts=0,updated=? WHERE trip_id=? AND user_id=? AND signature=? AND lock_id=?`,
        result,
        cursor,
        cursor >= regions.length ? 'ready' : 'queued',
        Date.now(),
        job.trip_id,
        job.user_id,
        job.signature,
        lease,
      );
      while (
        (one('SELECT COALESCE(SUM(length(result)),0) n FROM geo_jobs')!
          .n as number) >
        32 * 1024 * 1024
      ) {
        const old = one(
          'SELECT trip_id,user_id FROM geo_jobs WHERE lock_until<? AND NOT(trip_id=? AND user_id=?) ORDER BY updated LIMIT 1',
          Date.now(),
          job.trip_id,
          job.user_id,
        );
        if (!old) break;
        run(
          'DELETE FROM geo_jobs WHERE trip_id=? AND user_id=?',
          old.trip_id,
          old.user_id,
        );
      }
    }).immediate();
  } catch (error) {
    if (error instanceof HttpError && [403, 404].includes(error.status)) {
      run(
        'DELETE FROM geo_jobs WHERE trip_id=? AND user_id=? AND lock_id=?',
        job.trip_id,
        job.user_id,
        lease,
      );
      return;
    }
    run(
      'UPDATE geo_jobs SET state=?,attempts=attempts+1,next_run=?,updated=? WHERE trip_id=? AND user_id=? AND signature=? AND lock_id=?',
      signal.aborted ? 'queued' : 'error',
      Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(job.attempts, 7)),
      Date.now(),
      job.trip_id,
      job.user_id,
      job.signature,
      lease,
    );
  } finally {
    run(
      "UPDATE geo_jobs SET state=CASE WHEN state='running' THEN 'queued' ELSE state END,lock_until=0,lock_id=NULL WHERE trip_id=? AND user_id=? AND lock_id=?",
      job.trip_id,
      job.user_id,
      lease,
    );
  }
}
