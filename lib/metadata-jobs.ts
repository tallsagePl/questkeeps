import { db, all, one, run, id, type Row } from './db';
import { readPhotoExif } from './photo-metadata';
import { eligibleSource } from './source-jobs';
import { publishSourceMedia } from './source-media';
import { inside, type Resource } from './yandex';

export const METADATA_MAX_ATTEMPTS = 6;

function permitted(s: Row | undefined) {
  return (
    s &&
    s.approved &&
    s.disk_enabled &&
    (s.user_id === s.owner_id || s.member_active)
  );
}

export async function runMetadataJobs(signal?: AbortSignal) {
  // A killed decoder has consumed an attempt too; do not loop forever on a crashing file.
  run(
    "UPDATE metadata_jobs SET state=CASE WHEN attempts>=? THEN 'exhausted' ELSE 'retryable-error' END,next_attempt=?,lock_id=NULL,lock_until=0,updated=? WHERE state='processing' AND lock_until<?",
    METADATA_MAX_ATTEMPTS,
    Date.now() + 60000,
    Date.now(),
    Date.now(),
  );
  const due = all(
    `SELECT j.* FROM metadata_jobs j JOIN sources s ON s.id=j.source_id
    JOIN accounts a ON a.id=s.account_id JOIN trips t ON t.id=s.trip_id
    WHERE s.approved=1 AND a.disk_enabled=1 AND s.lock_until<?
      AND (s.user_id=t.owner_id OR EXISTS(SELECT 1 FROM members mb WHERE mb.trip_id=t.id AND mb.user_id=s.user_id AND mb.active=1))
      AND j.lock_until<? AND (j.state='pending' OR j.state='processing' OR j.state='retryable-error' AND j.next_attempt<=?)
    ORDER BY j.next_attempt,j.updated LIMIT 2`,
    Date.now(),
    Date.now(),
    Date.now(),
  );
  const result = { complete: 0, failed: 0 };
  for (const job of due) {
    if (signal?.aborted) break;
    const lease = id();
    if (
      !run(
        "UPDATE metadata_jobs SET state='processing',attempts=attempts+1,lock_id=?,lock_until=? WHERE source_id=? AND resource_id=? AND revision=? AND lock_until<? AND attempts=? AND state=?",
        lease,
        Date.now() + 60000,
        job.source_id,
        job.resource_id,
        job.revision,
        Date.now(),
        job.attempts,
        job.state,
      ).changes
    )
      continue;
    try {
      const before = eligibleSource(job.source_id);
      const r = JSON.parse(job.resource) as Resource;
      if (!permitted(before) || !inside(r.path, before!.path)) continue;
      const active = AbortSignal.any([
        ...(signal ? [signal] : []),
        AbortSignal.timeout(25000),
      ]);
      const info = await readPhotoExif(before!.account_id, r, active);
      active.throwIfAborted();
      db.transaction(() => {
        const current = one(
          'SELECT revision,lock_id FROM metadata_jobs WHERE source_id=? AND resource_id=?',
          job.source_id,
          job.resource_id,
        );
        if (current?.revision !== job.revision || current?.lock_id !== lease)
          return;
        const latest = eligibleSource(job.source_id);
        if (
          !permitted(latest) ||
          latest!.account_id !== before!.account_id ||
          latest!.path !== before!.path ||
          latest!.trip_start !== before!.trip_start ||
          latest!.trip_end !== before!.trip_end ||
          latest!.member_start !== before!.member_start ||
          latest!.member_end !== before!.member_end
        ) {
          run(
            "UPDATE metadata_jobs SET state='pending',attempts=MAX(0,attempts-1) WHERE source_id=? AND resource_id=? AND lock_id=?",
            job.source_id,
            job.resource_id,
            lease,
          );
          return;
        }
        if (info.metadataReadFailed) throw Error('Metadata read failed');
        publishSourceMedia(latest!, r, info);
        run(
          'UPDATE metadata_jobs SET state=?,next_attempt=0,updated=? WHERE source_id=? AND resource_id=? AND lock_id=?',
          Object.keys(info).length ? 'complete' : 'no-metadata',
          Date.now(),
          job.source_id,
          job.resource_id,
          lease,
        );
        result.complete++;
      }).immediate();
    } catch {
      if (signal?.aborted) {
        run(
          "UPDATE metadata_jobs SET state='pending',attempts=MAX(0,attempts-1) WHERE source_id=? AND resource_id=? AND lock_id=?",
          job.source_id,
          job.resource_id,
          lease,
        );
      } else {
        const attempt = job.attempts + 1;
        run(
          'UPDATE metadata_jobs SET state=?,attempts=?,next_attempt=?,updated=? WHERE source_id=? AND resource_id=? AND lock_id=?',
          attempt >= METADATA_MAX_ATTEMPTS ? 'exhausted' : 'retryable-error',
          attempt,
          Date.now() + Math.min(3600000, 60000 * 2 ** (attempt - 1)),
          Date.now(),
          job.source_id,
          job.resource_id,
          lease,
        );
        result.failed++;
      }
    } finally {
      // The lease is also crash-recoverable; an old task cannot release a new one.
      run(
        "UPDATE metadata_jobs SET state=CASE WHEN state='processing' THEN 'pending' ELSE state END,lock_id=NULL,lock_until=0 WHERE source_id=? AND resource_id=? AND lock_id=?",
        job.source_id,
        job.resource_id,
        lease,
      );
    }
  }
  return result;
}
