import type Database from 'better-sqlite3';

export function tripCoverSettings(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS trip_cover_settings (
    trip_id TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK(mode IN ('all','selected')),
    photo_ids TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(photo_ids) AND json_type(photo_ids)='array')
  )`);
}
