import type Database from 'better-sqlite3';

export function tripFollows(db: Database.Database) {
  db.exec(`CREATE TABLE trip_follows (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    share_hash TEXT NOT NULL,
    created INTEGER NOT NULL,
    PRIMARY KEY(user_id,trip_id)
  ); CREATE INDEX trip_follows_trip ON trip_follows(trip_id);`);
}
