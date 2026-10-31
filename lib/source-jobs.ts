import type { SourceSyncStatus } from './contracts';
import { all, db, id, one, run, type Row } from './db';
import { fail } from './access';

export const SYNC_INTERVAL = 15 * 60000;

// The request path only records intent; Yandex is accessed exclusively by the worker.
export function queueSourceSync(sourceId: string, manual = true) {
  return db
    .transaction(() => {
      const source = one(
        `SELECT s.*,a.disk_enabled,t.owner_id FROM sources s
      JOIN accounts a ON a.id=s.account_id JOIN trips t ON t.id=s.trip_id WHERE s.id=?`,
        sourceId,
      );
      if (!source?.approved) fail(403, 'errors.sourceNotApproved');
      if (!source.disk_enabled)
        fail(409, 'messages.yandexAccountDisconnectedReconnectItInYour');
      if (
        source.user_id !== source.owner_id &&
        !one(
          'SELECT 1 FROM members WHERE trip_id=? AND user_id=? AND active=1',
          source.trip_id,
          source.user_id,
        )
      )
        fail(403, 'messages.accessDenied');
      const job = one('SELECT * FROM source_jobs WHERE source_id=?', sourceId);
      if (
        source.lock_until > Date.now() ||
        job?.state === 'queued' ||
        (!manual && job?.state === 'error' && job.next_run > Date.now())
      )
        return { queued: true, busy: true, jobId: job?.id || source.lock_id };
      const jobId = id();
      run(
        `INSERT INTO source_jobs(source_id,id,state,requested) VALUES (?,?,'queued',?)
      ON CONFLICT(source_id) DO UPDATE SET id=excluded.id,state='queued',scanned=0,count=0,
      attempts=CASE WHEN ? THEN 0 ELSE source_jobs.attempts END,requested=excluded.requested,started=NULL,finished=NULL,next_run=0`,
        sourceId,
        jobId,
        Date.now(),
        Number(manual),
      );
      run('UPDATE sources SET error=NULL WHERE id=?', sourceId);
      if (manual)
        run(
          "UPDATE metadata_jobs SET state='pending',attempts=0,next_attempt=0 WHERE source_id=? AND state IN ('retryable-error','exhausted') AND lock_until<?",
          sourceId,
          Date.now(),
        );
      return { queued: true, busy: false, jobId };
    })
    .immediate();
}

export function sourceJobStatus(
  tripId: string,
  userId: string,
  owner: boolean,
): SourceSyncStatus {
  const now = Date.now();
  const jobs = all(
    `SELECT s.id sourceId,j.id jobId,j.state,j.scanned,j.count,j.started,j.finished,
      j.next_run nextAttempt,s.last_sync lastSync,s.error,s.lock_until lockUntil,s.approved,a.disk_enabled enabled,
      (s.user_id=t.owner_id OR EXISTS(SELECT 1 FROM members mb WHERE mb.trip_id=t.id AND mb.user_id=s.user_id AND mb.active=1)) eligible
    FROM sources s JOIN accounts a ON a.id=s.account_id JOIN trips t ON t.id=s.trip_id
    LEFT JOIN source_jobs j ON j.source_id=s.id
    WHERE s.trip_id=? AND (?=1 OR s.user_id=?)`,
    tripId,
    Number(owner),
    userId,
  );
  const metadata = one(
    `SELECT COUNT(*) total,
      COALESCE(SUM(m.state IN ('pending','processing') OR m.state='retryable-error' AND m.next_attempt<=?),0) active,
      COALESCE(SUM(m.state IN ('retryable-error','exhausted')),0) errors,
      COALESCE(SUM(m.state IN ('pending','processing','retryable-error')),0) waiting,
      COALESCE(SUM(m.state IN ('complete','no-metadata','unsupported')),0) completed,
      COALESCE(MAX(m.updated),0) updated
    FROM metadata_jobs m JOIN sources s ON s.id=m.source_id JOIN accounts a ON a.id=s.account_id JOIN trips t ON t.id=s.trip_id
    WHERE s.trip_id=? AND (?=1 OR s.user_id=?) AND s.approved=1 AND a.disk_enabled=1
      AND (s.user_id=t.owner_id OR EXISTS(SELECT 1 FROM members mb WHERE mb.trip_id=t.id AND mb.user_id=s.user_id AND mb.active=1))`,
    now + 30000,
    tripId,
    Number(owner),
    userId,
  )!;
  return {
    active:
      jobs.some(
        (j) =>
          j.approved &&
          j.enabled &&
          j.eligible &&
          (j.state === 'queued' ||
            j.lockUntil > now ||
            (!j.state && !j.lastSync)),
      ) || metadata.active > 0,
    jobs: jobs.map(({ approved, enabled, eligible, lockUntil, ...job }) => ({
      ...job,
      paused: !(approved && enabled && eligible),
      state:
        job.state === 'scanning' && lockUntil <= now
          ? 'queued'
          : job.state || 'idle',
    })) as SourceSyncStatus['jobs'],
    metadata: metadata as {
      total: number;
      active: number;
      errors: number;
      waiting: number;
      completed: number;
      updated: number;
    },
  };
}

export function eligibleSource(sourceId: string): Row | undefined {
  return one(
    `SELECT s.*,a.disk_enabled,t.start trip_start,t.end trip_end,t.owner_id,
    mb.start member_start,mb.end member_end,mb.active member_active FROM sources s
    JOIN accounts a ON a.id=s.account_id JOIN trips t ON t.id=s.trip_id
    LEFT JOIN members mb ON mb.trip_id=s.trip_id AND mb.user_id=s.user_id WHERE s.id=?`,
    sourceId,
  );
}

export function queueDueSync() {
  const now = Date.now();
  const sources = all(
    `SELECT s.id FROM sources s JOIN accounts a ON a.id=s.account_id JOIN trips t ON t.id=s.trip_id
    LEFT JOIN source_jobs j ON j.source_id=s.id WHERE s.approved=1 AND a.disk_enabled=1 AND s.lock_until<?
    AND (s.user_id=t.owner_id OR EXISTS(SELECT 1 FROM members mb WHERE mb.trip_id=t.id AND mb.user_id=s.user_id AND mb.active=1))
    AND (s.last_sync IS NULL OR s.last_sync<?) AND (j.source_id IS NULL OR j.next_run<=?) LIMIT 25`,
    now,
    now - SYNC_INTERVAL,
    now,
  );
  for (const source of sources) queueSourceSync(source.id, false);
  return sources.length;
}
