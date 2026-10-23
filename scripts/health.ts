import { migrations } from '../lib/migrations';
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
  'friend_links',
  'trip_follows',
  'telegram_state',
  'telegram_feedback',
  'telegram_outbox',
  'telegram_feedback_messages',
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
    emailVerificationRequired:
      process.env.EMAIL_VERIFICATION_REQUIRED === 'true',
    mailTransportConfigured:
      !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM,
    telegramConfigured:
      process.env.TELEGRAM_ENABLED !== 'false' &&
      !!process.env.TELEGRAM_BOT_TOKEN &&
      /^\d+$/.test(process.env.TELEGRAM_ADMIN_ID || ''),
  },
  emailQueue: {
    pending: (
      db
        .prepare(
          "SELECT count(*) n FROM delivery_jobs WHERE kind='verify-email' AND finished IS NULL",
        )
        .get() as { n: number }
    ).n,
    exhausted: (
      db
        .prepare(
          "SELECT count(*) n FROM delivery_jobs WHERE kind='verify-email' AND attempts>=8 AND last_error IS NOT NULL",
        )
        .get() as { n: number }
    ).n,
  },
  telegramQueue: {
    administratorStarted: tables.includes('telegram_state')
      ? !!db
          .prepare("SELECT value FROM telegram_state WHERE key='admin_started'")
          .get()
      : false,
    lastPollAt: tables.includes('telegram_state')
      ? (
          db
            .prepare(
              "SELECT value FROM telegram_state WHERE key='last_poll_at'",
            )
            .get() as { value: string } | undefined
        )?.value || null
      : null,
    pending: tables.includes('telegram_outbox')
      ? (
          db.prepare('SELECT count(*) n FROM telegram_outbox').get() as {
            n: number;
          }
        ).n
      : null,
    feedback: tables.includes('telegram_feedback')
      ? (
          db.prepare('SELECT count(*) n FROM telegram_feedback').get() as {
            n: number;
          }
        ).n
      : null,
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
  report.database.schemaVersion !== migrations.at(-1)!.version ||
  !report.configuration.encryptionKeyValid ||
  !report.configuration.schedulerSecretConfigured ||
  (report.configuration.emailVerificationRequired &&
    !report.configuration.mailTransportConfigured)
)
  process.exitCode = 1;
