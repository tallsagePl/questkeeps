import type Database from 'better-sqlite3';

export function mediaArchive(db: Database.Database) {
  // Version 8 may be restored for a code rollback while retaining this additive
  // data. Re-applying version 9 must preserve all existing rotations/exclusions.
  const columns = db.pragma('table_info(media)') as { name: string }[];
  if (!columns.some((column) => column.name === 'rotation'))
    db.exec(
      'ALTER TABLE media ADD COLUMN rotation INTEGER NOT NULL DEFAULT 0 CHECK(rotation IN (0,90,180,270))',
    );
  db.exec(`
    CREATE TABLE IF NOT EXISTS media_exclusions (
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resource_id TEXT NOT NULL,
      created INTEGER NOT NULL,
      PRIMARY KEY(trip_id,user_id,resource_id)
    );
    CREATE TRIGGER IF NOT EXISTS prevent_excluded_media_insert
    BEFORE INSERT ON media
    WHEN EXISTS (SELECT 1 FROM media_exclusions e WHERE e.trip_id=NEW.trip_id AND e.user_id=NEW.user_id AND e.resource_id=NEW.resource_id)
    BEGIN SELECT RAISE(IGNORE); END;
  `);
}
