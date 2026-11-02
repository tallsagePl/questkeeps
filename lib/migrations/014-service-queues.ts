import type Database from 'better-sqlite3';

export function serviceQueues(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS account_refresh_locks (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    owner TEXT NOT NULL,lock_until INTEGER NOT NULL);`);
  db.exec(`CREATE TABLE IF NOT EXISTS geo_jobs (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signature TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'queued',result TEXT NOT NULL DEFAULT '[]',
  cursor INTEGER NOT NULL DEFAULT 0,total INTEGER NOT NULL DEFAULT 0,
  lock_id TEXT,lock_until INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,
  next_run INTEGER NOT NULL DEFAULT 0,updated INTEGER NOT NULL,
  PRIMARY KEY(trip_id,user_id));
 CREATE INDEX IF NOT EXISTS geo_jobs_due ON geo_jobs(state,next_run,lock_until);`);
  const columns = db.pragma('table_info(telegram_outbox)') as {
    name: string;
  }[];
  for (const [name, type] of [
    ['created', 'INTEGER NOT NULL DEFAULT 0'],
    ['terminal', 'INTEGER NOT NULL DEFAULT 0'],
    ['last_error', 'TEXT'],
  ])
    if (!columns.some((c) => c.name === name))
      db.exec('ALTER TABLE telegram_outbox ADD COLUMN ' + name + ' ' + type);
  db.exec('UPDATE telegram_outbox SET created=available WHERE created=0');
  db.exec(
    'CREATE TABLE IF NOT EXISTS app_clock (id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL DEFAULT 0); INSERT OR IGNORE INTO app_clock VALUES (1,0); CREATE INDEX IF NOT EXISTS media_anniversary ON media(substr(taken,6,5),taken DESC)',
  );
  for (const table of [
    'media',
    'media_titles',
    'media_favorites',
    'confirmed_places',
    'accounts',
    'user_avatars',
    'exif_cache',
    'trip_cover_settings',
    'trip_cover_positions',
    'sources',
    'members',
    'notes',
    'note_replies',
    'trips',
    'friendships',
    'users',
    'trip_follows',
    'source_jobs',
    'metadata_jobs',
    'user_handles',
    'trip_description_mentions',
  ])
    for (const event of ['INSERT', 'UPDATE', 'DELETE'])
      db.exec(
        'CREATE TRIGGER IF NOT EXISTS clock_' +
          table +
          '_' +
          event.toLowerCase() +
          ' AFTER ' +
          event +
          ' ON ' +
          table +
          ' BEGIN UPDATE app_clock SET version=version+1 WHERE id=1; END;',
      );
  db.exec(
    'CREATE TABLE IF NOT EXISTS public_article_cache (key TEXT PRIMARY KEY,json TEXT NOT NULL,updated INTEGER NOT NULL)',
  );
}
