import type Database from 'better-sqlite3';

export function coverPositions(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS trip_cover_positions (
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    x REAL NOT NULL DEFAULT 50 CHECK(x BETWEEN 0 AND 100),
    y REAL NOT NULL DEFAULT 50 CHECK(y BETWEEN 0 AND 100),
    PRIMARY KEY(trip_id,media_id)
  )`);
}
