import type Database from 'better-sqlite3';

export function mediaGuestVisibility(db: Database.Database) {
  db.exec(
    'ALTER TABLE media ADD COLUMN hidden_from_guests INTEGER NOT NULL DEFAULT 0 CHECK (hidden_from_guests IN (0,1))',
  );
}
