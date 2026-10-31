import { storeMessage } from './i18n/messages';
import { db, one, all, run, id, type Row } from './db';
import { disk, inside, type Resource } from './yandex';
import { fail, HttpError } from './access';
import { eligibleSource, SYNC_INTERVAL } from './source-jobs';
import { EXIF_TYPES, publishSourceMedia, resourceRecord } from './source-media';

function assertEligible(s: Row | undefined): asserts s is Row {
  if (!s?.approved) fail(403, 'errors.sourceNotApproved');
  if (!s.disk_enabled)
    fail(409, 'messages.yandexAccountDisconnectedReconnectItInYour');
  if (s.user_id !== s.owner_id && !s.member_active)
    fail(403, 'messages.accessDenied');
}

export async function syncSource(sourceId: string, signal?: AbortSignal) {
  const s = eligibleSource(sourceId);
  assertEligible(s);
  const lease = id();
  if (
    !run(
      'UPDATE sources SET lock_until=?,lock_id=? WHERE id=? AND lock_until<?',
      Date.now() + 180000,
      lease,
      sourceId,
      Date.now(),
    ).changes
  )
    return { busy: true };
  const existing = one('SELECT * FROM source_jobs WHERE source_id=?', sourceId);
  const jobId = existing?.state === 'queued' ? existing.id : id();
  run(
    `INSERT INTO source_jobs(source_id,id,state,requested,started) VALUES (?,?,'scanning',?,?)
    ON CONFLICT(source_id) DO UPDATE SET id=excluded.id,state='scanning',started=excluded.started,scanned=0,count=0,finished=NULL`,
    sourceId,
    jobId,
    Date.now(),
    Date.now(),
  );
  let renewed = Date.now();
  let scanned = 0;
  let count = 0;
  const active = AbortSignal.any([
    ...(signal ? [signal] : []),
    AbortSignal.timeout(15 * 60000),
  ]);
  const check = (force = false) => {
    active.throwIfAborted();
    if (!force && Date.now() - renewed < 20000) return;
    if (
      !run(
        'UPDATE sources SET lock_until=? WHERE id=? AND lock_id=?',
        Date.now() + 180000,
        s.id,
        lease,
      ).changes
    )
      fail(409, 'messages.synchronizationWasRestarted');
    run(
      'UPDATE source_jobs SET scanned=? WHERE source_id=? AND id=?',
      scanned,
      s.id,
      jobId,
    );
    renewed = Date.now();
  };
  try {
    const queue = [s.path];
    const seen = new Set<string>();
    const resources = new Map<string, Resource>();
    let pages = 0;
    while (queue.length) {
      const folder = queue.shift()!;
      if (seen.has(folder)) continue;
      seen.add(folder);
      let offset = 0;
      while (true) {
        check();
        if (++pages > 2000) fail(422, 'errors.folderTooLarge');
        const page = (await disk(
          s.account_id,
          'resources',
          { path: folder, limit: '100', offset: String(offset), sort: 'name' },
          active,
        )) as Resource;
        if (
          !page._embedded ||
          !Array.isArray(page._embedded.items) ||
          !Number.isSafeInteger(page._embedded.total) ||
          page._embedded.total < 0
        )
          fail(422, 'errors.sourceMustBeFolder');
        for (const r of page._embedded.items) {
          check();
          if (typeof r.path !== 'string' || !inside(r.path, s.path)) continue;
          if (r.type === 'dir') {
            if (queue.length + seen.size + scanned >= 20000)
              fail(422, 'errors.folderTooLarge');
            queue.push(r.path);
            continue;
          }
          if (!r.mime_type?.match(/^(image|video)\//)) continue;
          if (
            r.path.length > 4096 ||
            typeof r.name !== 'string' ||
            r.name.length > 4096
          )
            fail(422, 'errors.folderTooLarge');
          resources.set(r.resource_id || r.path, r);
          scanned++;
          if (scanned + queue.length + seen.size > 20000)
            fail(422, 'errors.folderTooLarge');
        }
        offset += page._embedded.items.length;
        if (offset >= page._embedded.total) break;
        if (!page._embedded.items.length)
          fail(502, 'errors.incompleteDiskResponse');
      }
    }
    check(true);
    db.transaction(() => {
      const latest = eligibleSource(s.id);
      assertEligible(latest);
      if (
        one('SELECT lock_id FROM sources WHERE id=?', s.id)?.lock_id !== lease
      )
        fail(409, 'messages.synchronizationWasRestarted');
      if (
        latest.trip_start !== s.trip_start ||
        latest.trip_end !== s.trip_end ||
        latest.member_start !== s.member_start ||
        latest.member_end !== s.member_end ||
        latest.path !== s.path ||
        latest.account_id !== s.account_id
      )
        fail(409, 'messages.participationDatesChangedRunSynchronizationAgain');
      db.exec(
        'CREATE TEMP TABLE IF NOT EXISTS sync_seen(resource_id TEXT PRIMARY KEY); DELETE FROM sync_seen;',
      );
      const seenStatement = db.prepare(
        'INSERT OR IGNORE INTO sync_seen VALUES (?)',
      );
      const metadataStatement =
        db.prepare(`INSERT INTO metadata_jobs(source_id,resource_id,revision,resource,state,updated) VALUES (?,?,?,?,?,?)
        ON CONFLICT(source_id,resource_id) DO UPDATE SET revision=excluded.revision,resource=excluded.resource,state=excluded.state,
        attempts=0,next_attempt=0,lock_id=NULL,lock_until=0,updated=excluded.updated
        WHERE metadata_jobs.revision<>excluded.revision OR json_extract(metadata_jobs.resource,'$.path')<>json_extract(excluded.resource,'$.path') OR json_extract(metadata_jobs.resource,'$.mime_type')<>json_extract(excluded.resource,'$.mime_type')`);
      for (const [rid, r] of resources) {
        seenStatement.run(rid);
        if (
          one(
            'SELECT 1 FROM media_exclusions WHERE trip_id=? AND user_id=? AND resource_id=?',
            s.trip_id,
            s.user_id,
            rid,
          )
        )
          continue;
        const eligible = EXIF_TYPES.has(r.mime_type || '');
        metadataStatement.run(
          s.id,
          rid,
          String(r.revision || r.modified || ''),
          resourceRecord(r),
          eligible ? 'pending' : 'unsupported',
          Date.now(),
        );
        run(
          'UPDATE metadata_jobs SET resource=? WHERE source_id=? AND resource_id=? AND resource<>?',
          resourceRecord(r),
          s.id,
          rid,
          resourceRecord(r),
        );
        if (publishSourceMedia(latest, r)) count++;
      }
      // A failed/partial scan never reaches this point and cannot hide older media.
      run(
        'UPDATE media SET missing=1 WHERE source_id=? AND missing=0 AND NOT EXISTS(SELECT 1 FROM sync_seen WHERE resource_id=media.resource_id)',
        s.id,
      );
      run(
        'DELETE FROM metadata_jobs WHERE source_id=? AND NOT EXISTS(SELECT 1 FROM sync_seen WHERE resource_id=metadata_jobs.resource_id)',
        s.id,
      );
      db.exec('DELETE FROM sync_seen');
      run(
        'UPDATE sources SET last_sync=?,error=NULL WHERE id=?',
        Date.now(),
        s.id,
      );
      run(
        "UPDATE source_jobs SET state='complete',count=?,scanned=?,attempts=0,finished=?,next_run=? WHERE source_id=? AND id=?",
        count,
        scanned,
        Date.now(),
        Date.now() + SYNC_INTERVAL,
        s.id,
        jobId,
      );
    }).immediate();
    return { count, jobId };
  } catch (error) {
    db.transaction(() => {
      if (
        one('SELECT lock_id FROM sources WHERE id=?', s.id)?.lock_id !== lease
      )
        return;
      if (signal?.aborted) {
        run(
          "UPDATE source_jobs SET state='queued',next_run=0 WHERE source_id=? AND id=?",
          s.id,
          jobId,
        );
        return;
      }
      const attempts = (existing?.attempts || 0) + 1;
      const message =
        error instanceof HttpError && error.translation
          ? storeMessage(error.translation)
          : 'trip.couldNotSynchronizeTheFolder';
      run('UPDATE sources SET error=? WHERE id=?', message, s.id);
      run(
        "UPDATE source_jobs SET state='error',attempts=?,finished=?,next_run=? WHERE source_id=? AND id=?",
        attempts,
        Date.now(),
        Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(attempts - 1, 7)),
        s.id,
        jobId,
      );
    }).immediate();
    throw error;
  } finally {
    run(
      'UPDATE sources SET lock_until=0,lock_id=NULL WHERE id=? AND lock_id=?',
      s.id,
      lease,
    );
  }
}

export async function syncDue(signal?: AbortSignal) {
  const sources = all(
    `SELECT s.id FROM sources s JOIN trips t ON t.id=s.trip_id JOIN accounts a ON a.id=s.account_id
    LEFT JOIN source_jobs j ON j.source_id=s.id WHERE a.disk_enabled=1 AND s.approved=1 AND s.lock_until<?
    AND (s.user_id=t.owner_id OR EXISTS(SELECT 1 FROM members m WHERE m.trip_id=s.trip_id AND m.user_id=s.user_id AND m.active=1))
    AND (j.state='queued' OR j.next_run<=? AND (j.state IN ('scanning','error') OR s.last_sync IS NULL OR s.last_sync<?) OR j.source_id IS NULL AND (s.last_sync IS NULL OR s.last_sync<?))
    ORDER BY CASE WHEN j.state='queued' THEN 0 ELSE 1 END,COALESCE(j.requested,s.last_sync,0) LIMIT 2`,
    Date.now(),
    Date.now(),
    Date.now() - SYNC_INTERVAL,
    Date.now() - SYNC_INTERVAL,
  );
  const result = [];
  for (const s of sources) {
    if (signal?.aborted) break;
    try {
      result.push({ id: s.id, ...(await syncSource(s.id, signal)) });
    } catch {
      result.push({ id: s.id, error: true });
    }
  }
  return result;
}
