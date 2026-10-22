import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
const path = resolve(process.env.DATABASE_PATH || './data/travel.sqlite');
if (!existsSync(path)) {
  console.log(JSON.stringify({ database: 'missing' }));
  process.exit(1);
}
const db = new Database(path, { readonly: true, fileMustExist: true });
const integrity = db.pragma('quick_check') as { quick_check: string }[];
const foreignKeys = db.pragma('foreign_key_check');
const required = [
  'users',
  'sessions',
  'trips',
  'members',
  'invites',
  'accounts',
  'sources',
  'media',
  'notes',
  'places',
  'oauth_states',
  'throttle',
  'exif_cache',
  'schema_migrations',
  'email_status',
  'email_verifications',
  'delivery_jobs',
];
const tables = (
  db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
    name: string;
  }[]
).map((t) => t.name);
const report = {
  database: {
    path,
    integrity: integrity.every((r) => r.quick_check === 'ok') ? 'ok' : 'failed',
    foreignKeyViolations: (foreignKeys as unknown[]).length,
    missingTables: required.filter((t) => !tables.includes(t)),
    journalMode: db.pragma('journal_mode', { simple: true }),
    schemaVersion: db.pragma('user_version', { simple: true }),
  },
  configuration: {
    encryptionKeyValid: /^[a-f0-9]{64}$/i.test(
      process.env.TOKEN_ENCRYPTION_KEY || '',
    ),
    schedulerSecretConfigured: !!process.env.CRON_SECRET,
    yandexOAuthConfigured:
      !!process.env.YANDEX_CLIENT_ID && !!process.env.YANDEX_CLIENT_SECRET,
    appURL: process.env.APP_URL || null,
  },
  records: {
    users: (db.prepare('SELECT count(*) n FROM users').get() as { n: number })
      .n,
    trips: (db.prepare('SELECT count(*) n FROM trips').get() as { n: number })
      .n,
    accounts: (
      db.prepare('SELECT count(*) n FROM accounts').get() as { n: number }
    ).n,
  },
};
db.close();
console.log(JSON.stringify(report, null, 2));
if (
  report.database.integrity !== 'ok' ||
  report.database.foreignKeyViolations ||
  report.database.missingTables.length ||
  report.database.schemaVersion !== 2 ||
  !report.configuration.encryptionKeyValid ||
  !report.configuration.schedulerSecretConfigured
)
  process.exitCode = 1;
