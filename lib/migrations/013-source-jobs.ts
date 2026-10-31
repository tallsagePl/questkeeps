import type Database from 'better-sqlite3';

export function sourceJobs(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS source_jobs (
    source_id TEXT PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
    id TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued', scanned INTEGER NOT NULL DEFAULT 0,
    count INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
    requested INTEGER NOT NULL, started INTEGER, finished INTEGER,
    next_run INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS metadata_jobs (
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    resource_id TEXT NOT NULL, revision TEXT NOT NULL, resource TEXT NOT NULL,
    state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt INTEGER NOT NULL DEFAULT 0, lock_id TEXT, lock_until INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL, PRIMARY KEY(source_id,resource_id)
  );
  CREATE INDEX IF NOT EXISTS metadata_jobs_due ON metadata_jobs(state,next_attempt,lock_until);
  CREATE TABLE IF NOT EXISTS media_location_overrides (
    media_id TEXT PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
    lat REAL NOT NULL, lon REAL NOT NULL
  );
  `);
  const columns = db.pragma('table_info(media)') as { name: string }[];
  if (
    columns.some((c) => c.name === 'lat') &&
    columns.some((c) => c.name === 'lon')
  )
    db.exec(
      'INSERT OR IGNORE INTO media_location_overrides SELECT id,lat,lon FROM media WHERE lat IS NOT NULL AND lon IS NOT NULL',
    );
}
