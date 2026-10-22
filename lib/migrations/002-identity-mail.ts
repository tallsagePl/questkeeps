import type Database from 'better-sqlite3';

export function identityMail(db: Database.Database) {
  const columns = db.pragma('table_info(accounts)') as { name: string }[];
  if (!columns.some((c) => c.name === 'provider_email'))
    db.exec('ALTER TABLE accounts ADD COLUMN provider_email TEXT');
  db.exec(
    'CREATE TABLE IF NOT EXISTS email_status (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,verified_at INTEGER,required INTEGER NOT NULL DEFAULT 0 CHECK(required IN (0,1)));' +
      'CREATE TABLE IF NOT EXISTS email_verifications (hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);' +
      'CREATE INDEX IF NOT EXISTS email_verification_user ON email_verifications(user_id);' +
      'CREATE TABLE IF NOT EXISTS delivery_jobs (id TEXT PRIMARY KEY,kind TEXT NOT NULL,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,payload TEXT NOT NULL,created INTEGER NOT NULL,available INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,lease_id TEXT,finished INTEGER,last_error TEXT);' +
      'CREATE INDEX IF NOT EXISTS delivery_user ON delivery_jobs(user_id,kind,finished);' +
      'CREATE INDEX IF NOT EXISTS delivery_due ON delivery_jobs(kind,finished,available,lease_until);' +
      'CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);' +
      'CREATE INDEX IF NOT EXISTS throttle_expiry ON throttle(until);',
  );
}
