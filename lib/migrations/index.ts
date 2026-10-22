import type Database from 'better-sqlite3';
import { baseline } from './001-baseline';
import { identityMail } from './002-identity-mail';
export const migrations = [
  { version: 1, name: 'baseline', up: baseline },
  { version: 2, name: 'identity-mail', up: identityMail },
];
export function migrate(db: Database.Database) {
  db.transaction(() => {
    const current = Number(db.pragma('user_version', { simple: true }));
    if (current > migrations.at(-1)!.version)
      throw Error('Database schema is newer than this application');
    db.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied INTEGER NOT NULL)',
    );
    for (const migration of migrations) {
      const record = db
        .prepare('SELECT name FROM schema_migrations WHERE version=?')
        .get(migration.version) as { name: string } | undefined;
      if (record && record.name !== migration.name)
        throw Error('Migration history mismatch');
      // Existing installations used user_version=1 before the migration ledger.
      if (migration.version > current) migration.up(db);
      if (!record)
        db.prepare('INSERT INTO schema_migrations VALUES (?,?,?)').run(
          migration.version,
          migration.name,
          Date.now(),
        );
    }
    db.pragma('user_version = ' + migrations.at(-1)!.version);
  }).immediate();
}
