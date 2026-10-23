import type Database from 'better-sqlite3';

export function tripInvitations(db: Database.Database) {
  db.exec(`
    ALTER TABLE members ADD COLUMN all_photos INTEGER NOT NULL DEFAULT 0 CHECK(all_photos IN (0,1));
    ALTER TABLE invites ADD COLUMN all_photos INTEGER NOT NULL DEFAULT 0 CHECK(all_photos IN (0,1));
    CREATE TABLE trip_invitations (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      start TEXT NOT NULL,
      end TEXT NOT NULL,
      all_photos INTEGER NOT NULL DEFAULT 0 CHECK(all_photos IN (0,1)),
      created INTEGER NOT NULL,
      expires INTEGER NOT NULL,
      UNIQUE(trip_id,recipient_id)
    );
    CREATE INDEX trip_invitations_recipient ON trip_invitations(recipient_id,expires);
  `);
}
