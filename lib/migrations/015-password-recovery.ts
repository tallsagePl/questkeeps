import type Database from 'better-sqlite3';

export function passwordRecovery(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS password_resets (
    hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL,credential_hash TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS password_resets_user ON password_resets(user_id);`);
}
