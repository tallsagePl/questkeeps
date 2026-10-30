import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import {
  mkdirSync,
  chmodSync,
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

export const VIDEO_LIMIT = 1024 * 1024 * 1024;

export const VIDEO_SCRATCH = 544 * 1024 * 1024;

export const VIDEO_INPUT_LIMIT = 256 * 1024 * 1024;

export const VIDEO_OUTPUT_LIMIT = 128 * 1024 * 1024;

export const VIDEO_DURATION_LIMIT = 300;

const overhead = 8 * 1024 * 1024;

const ttl = 7 * 86400000;

const cost = (bytes: number) => Math.ceil(bytes / 4096) * 4096;

export type VideoJob = {
  key: string;
  media_id: string;
  state: string;
  stage: string;
  error: string | null;
  bytes: number;
  used: number;
  created: number;
};

export function videoKey(m: Record<string, unknown>) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        '720p-h264-v1',
        m.account_id,
        m.resource_id,
        m.path,
        m.revision || '',
      ]),
    )
    .digest('hex');
}

// Derived, disposable state is kept outside travel.sqlite and its backup.
export class VideoStore {
  readonly directory: string;
  readonly index: Database.Database;
  constructor(
    directory: string,
    private limit = VIDEO_LIMIT,
    private scratch = VIDEO_SCRATCH,
  ) {
    this.directory = resolve(directory);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.index = new Database(join(this.directory, 'index.sqlite'), {
      timeout: 1000,
    });
    this.index.pragma('journal_mode = DELETE');
    this.index.pragma('page_size = 4096');
    this.index.pragma('max_page_count = 256');
    this.index
      .exec(`CREATE TABLE IF NOT EXISTS jobs(key TEXT PRIMARY KEY,media_id TEXT NOT NULL,state TEXT NOT NULL,stage TEXT NOT NULL DEFAULT '',error TEXT,bytes INTEGER NOT NULL DEFAULT 0,used INTEGER NOT NULL,created INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS readers(id TEXT PRIMARY KEY,key TEXT NOT NULL,until INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS readers_key ON readers(key);
      CREATE TABLE IF NOT EXISTS heartbeat(id INTEGER PRIMARY KEY,at INTEGER NOT NULL);`);
    chmodSync(join(this.directory, 'index.sqlite'), 0o600);
  }
  file(
    key: string,
    suffix: 'mp4' | 'jpg' | 'input' | 'working.mp4' | 'working.jpg',
  ) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw Error('Invalid video key');
    return join(this.directory, key + '.' + suffix);
  }
  job(key: string) {
    return this.index.prepare('SELECT * FROM jobs WHERE key=?').get(key) as
      VideoJob | undefined;
  }
  status(key: string) {
    const job = this.job(key);
    if (
      job?.state === 'ready' &&
      (!existsSync(this.file(key, 'mp4')) || !existsSync(this.file(key, 'jpg')))
    ) {
      this.index
        .prepare(
          "UPDATE jobs SET state='error',error='video.failed',used=? WHERE key=?",
        )
        .run(Date.now(), key);
      return this.job(key);
    }
    return job;
  }
  enqueue(key: string, mediaId: string) {
    return this.index
      .transaction(() => {
        const old = this.status(key);
        if (old && ['pending', 'processing', 'ready'].includes(old.state))
          return old;
        if (
          old?.error &&
          ['video.tooLarge', 'video.tooLong', 'video.unsupported'].includes(
            old.error,
          )
        )
          return old;
        if (old && old.used > Date.now() - 30000) return old;
        const pending = this.index
          .prepare(
            "SELECT count(*) n FROM jobs WHERE state IN ('pending','processing')",
          )
          .get() as { n: number };
        if (pending.n >= 16) throw Error('Video queue full');
        this.index
          .prepare("DELETE FROM jobs WHERE state='error' AND used<?")
          .run(Date.now() - ttl);
        const count = this.index
          .prepare('SELECT count(*) n FROM jobs')
          .get() as { n: number };
        if (count.n >= 256 && !old) throw Error('Video queue full');
        const now = Date.now();
        this.index
          .prepare(
            "INSERT OR REPLACE INTO jobs(key,media_id,state,stage,error,bytes,used,created,attempts) VALUES (?,?,'pending','',NULL,0,?,?,0)",
          )
          .run(key, mediaId, now, now);
        return this.job(key)!;
      })
      .immediate();
  }
  workerLock() {
    let lock: Database.Database | undefined;
    try {
      lock = new Database(join(this.directory, 'worker.sqlite'), {
        timeout: 0,
      });
      lock.exec('CREATE TABLE IF NOT EXISTS mutex(id INTEGER PRIMARY KEY)');
      lock.exec('BEGIN IMMEDIATE');
      const held = lock;
      return () => {
        try {
          held.exec('ROLLBACK');
        } finally {
          held.close();
        }
      };
    } catch {
      lock?.close();
      return null;
    }
  }
  alive() {
    const row = this.index
      .prepare('SELECT at FROM heartbeat WHERE id=1')
      .get() as { at: number } | undefined;
    return !!row && row.at > Date.now() - 60000;
  }
  tick() {
    this.index
      .prepare('INSERT OR REPLACE INTO heartbeat VALUES (1,?)')
      .run(Date.now());
  }
  next() {
    return this.index
      .prepare(
        "SELECT * FROM jobs WHERE state='pending' ORDER BY created LIMIT 1",
      )
      .get() as VideoJob | undefined;
  }
  stage(key: string, stage: string) {
    this.index
      .prepare(
        "UPDATE jobs SET state='processing',stage=?,used=?,attempts=attempts+CASE WHEN state='pending' THEN 1 ELSE 0 END WHERE key=?",
      )
      .run(stage, Date.now(), key);
  }
  requeue(key: string) {
    this.index
      .prepare(
        "UPDATE jobs SET state='pending',stage='',error=NULL,used=?,attempts=MAX(0,attempts-1) WHERE key=?",
      )
      .run(Date.now(), key);
  }
  failed(key: string, error = 'video.failed') {
    this.index
      .prepare("UPDATE jobs SET state='error',error=?,used=? WHERE key=?")
      .run(error, Date.now(), key);
  }
  recover() {
    // A repeatedly crashing decoder must not restart forever.
    this.index
      .prepare(
        "UPDATE jobs SET state='error',error='video.failed',used=? WHERE state='processing' AND attempts>=2",
      )
      .run(Date.now());
    // The separate SQLite writer lock proves no converter is still using these files.
    this.index
      .prepare(
        "UPDATE jobs SET state='pending',stage='' WHERE state='processing'",
      )
      .run();
    this.index.prepare('DELETE FROM readers WHERE until<?').run(Date.now());
    for (const name of readdirSync(this.directory)) {
      if (/^[a-f0-9]{64}\.(input|working\.mp4|working\.jpg)$/.test(name))
        unlinkSync(join(this.directory, name));
      const key = /^([a-f0-9]{64})\.(mp4|jpg)$/.exec(name)?.[1];
      if (
        key &&
        this.job(key)?.state !== 'ready' &&
        !this.index
          .prepare('SELECT 1 FROM readers WHERE key=? AND until>?')
          .get(key, Date.now())
      )
        unlinkSync(join(this.directory, name));
    }
  }
  reserve() {
    const reserved = this.index
      .transaction(() => {
        this.index.prepare('DELETE FROM readers WHERE until<?').run(Date.now());
        const rows = this.index
          .prepare("SELECT * FROM jobs WHERE state='ready' ORDER BY used")
          .all() as VideoJob[];
        let used = rows.reduce((n, row) => n + row.bytes, 0);
        for (const row of rows) {
          if (
            used + this.scratch + overhead <= this.limit &&
            row.used > Date.now() - ttl
          )
            continue;
          if (
            this.index
              .prepare('SELECT 1 FROM readers WHERE key=? AND until>?')
              .get(row.key, Date.now())
          )
            continue;
          for (const suffix of ['mp4', 'jpg'] as const) {
            const file = this.file(row.key, suffix);
            if (existsSync(file)) unlinkSync(file);
          }
          this.index.prepare('DELETE FROM jobs WHERE key=?').run(row.key);
          used -= row.bytes;
        }
        if (used + this.scratch + overhead > this.limit) return false;
        const actual = readdirSync(this.directory).reduce(
          (n, name) => n + cost(statSync(join(this.directory, name)).size),
          0,
        );
        return actual + this.scratch <= this.limit;
      })
      .immediate();
    if (!reserved) throw Error('Video storage busy');
  }
  ready(key: string) {
    const bytes =
      cost(statSync(this.file(key, 'mp4')).size) +
      cost(statSync(this.file(key, 'jpg')).size);
    this.index
      .prepare(
        "UPDATE jobs SET state='ready',stage='',error=NULL,bytes=?,used=? WHERE key=?",
      )
      .run(bytes, Date.now(), key);
  }
  lease(key: string) {
    const lease = this.index
      .transaction(() => {
        this.index.prepare('DELETE FROM readers WHERE until<?').run(Date.now());
        if (this.status(key)?.state !== 'ready') return null;
        const count = this.index
          .prepare('SELECT count(*) n FROM readers')
          .get() as { n: number };
        if (count.n >= 512) return null;
        const id = randomUUID();
        this.index
          .prepare('INSERT INTO readers VALUES (?,?,?)')
          .run(id, key, Date.now() + 60000);
        this.index
          .prepare('UPDATE jobs SET used=? WHERE key=?')
          .run(Date.now(), key);
        return id;
      })
      .immediate();
    if (!lease) return null;
    return {
      renew: () =>
        this.index
          .prepare('UPDATE readers SET until=? WHERE id=?')
          .run(Date.now() + 60000, lease),
      release: () =>
        this.index.prepare('DELETE FROM readers WHERE id=?').run(lease),
    };
  }
  close() {
    this.index.close();
  }
}
