import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { readFile, readdir, writeFile, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Payload allocation plus the bounded metadata DB/journal stays below 256 MiB.
export const PREVIEW_CACHE_LIMIT = 256 * 1024 * 1024;

export const PREVIEW_CONTENT_LIMIT = PREVIEW_CACHE_LIMIT - 4 * 1024 * 1024;

export const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;

export const PREVIEW_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

export type PreviewImage = { body: Buffer; contentType: string };

type Entry = {
  key: string;
  bytes: number;
  cost: number;
  type: string;
  digest: string;
  expires: number;
  used: number;
};

export function previewKey(media: Record<string, unknown>) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        'disk-preview-xl-v1',
        media.account_id,
        media.resource_id,
        media.path,
        media.revision || '',
      ]),
    )
    .digest('hex');
}

function digest(body: Buffer) {
  return createHash('sha256').update(body).digest('hex');
}

export class DiskPreviewCache {
  private index?: Database.Database;
  private retryAt = 0;
  private writing: Promise<unknown> = Promise.resolve();
  readonly directory: string;

  constructor(
    directory: string,
    private maxBytes = PREVIEW_CONTENT_LIMIT,
    private maxEntries = 2048,
    private ttlMs = 86400000,
  ) {
    this.directory = resolve(directory);
  }

  private database() {
    if (this.index) return this.index;
    if (Date.now() < this.retryAt) return;
    let index: Database.Database | undefined;
    try {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      index = new Database(join(this.directory, 'index.sqlite'), {
        timeout: 0,
      });
      index.pragma('journal_mode = DELETE');
      index.pragma('page_size = 4096');
      index.pragma('max_page_count = 256');
      index.exec(
        'CREATE TABLE IF NOT EXISTS entries(key TEXT PRIMARY KEY, bytes INTEGER NOT NULL, cost INTEGER NOT NULL, type TEXT NOT NULL, digest TEXT NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS entries_used ON entries(used)',
      );
      chmodSync(join(this.directory, 'index.sqlite'), 0o600);
      this.index = index;
      return index;
    } catch {
      index?.close();
      this.retryAt = Date.now() + 30000;
      // A missing/full/unavailable cache must never make a photo unavailable.
      return;
    }
  }

  private file(key: string) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw Error('Invalid preview cache key');
    return join(this.directory, key + '.preview');
  }

  async get(key: string): Promise<PreviewImage | undefined> {
    try {
      const index = this.database();
      if (!index) return;
      const entry = index
        .prepare('SELECT * FROM entries WHERE key=?')
        .get(key) as Entry | undefined;
      if (
        !entry ||
        entry.expires <= Date.now() ||
        !PREVIEW_TYPES.has(entry.type)
      )
        return;
      const body = await readFile(this.file(key));
      if (body.length !== entry.bytes || digest(body) !== entry.digest) return;
      try {
        index
          .prepare('UPDATE entries SET used=? WHERE key=?')
          .run(Date.now(), key);
      } catch {
        /* Another web slot may be publishing a preview. */
      }
      return { body, contentType: entry.type };
    } catch {
      return;
    }
  }

  async put(key: string, image: PreviewImage): Promise<boolean> {
    const work = this.writing.then(() => this.publish(key, image));
    this.writing = work.catch(() => false);
    return work;
  }

  private async publish(key: string, image: PreviewImage) {
    const cost = Math.ceil(image.body.length / 4096) * 4096;
    if (
      !image.body.length ||
      image.body.length > MAX_PREVIEW_BYTES ||
      cost > this.maxBytes ||
      !PREVIEW_TYPES.has(image.contentType)
    )
      return false;
    const index = this.database();
    if (!index) return false;
    let transaction = false;
    let temporary: string | undefined;
    try {
      // Cross-process quota lock: old/new blue-green slots share the same budget.
      // timeout=0 makes contention skip a cache write instead of blocking the JS event loop.
      index.exec('BEGIN IMMEDIATE');
      transaction = true;
      const files = new Set(await readdir(this.directory));
      let entries = index
        .prepare('SELECT * FROM entries ORDER BY used,key')
        .all() as Entry[];
      const tracked = new Set(entries.map((entry) => entry.key + '.preview'));
      for (const name of files) {
        if (
          (/^[a-f0-9]{64}\.preview$/.test(name) && !tracked.has(name)) ||
          /^\.pending-[a-f0-9-]+$/.test(name)
        ) {
          await unlink(join(this.directory, name)).catch(() => {});
        }
      }
      const remove = async (entry: Entry) => {
        // Files are removed before their quota is released. A failed unlink aborts the write.
        if (files.has(entry.key + '.preview'))
          await unlink(this.file(entry.key));
        index.prepare('DELETE FROM entries WHERE key=?').run(entry.key);
      };
      const keep: Entry[] = [];
      for (const entry of entries) {
        if (
          entry.key === key ||
          entry.expires <= Date.now() ||
          !files.has(entry.key + '.preview')
        )
          await remove(entry);
        else keep.push(entry);
      }
      entries = keep;
      let used = entries.reduce((sum, entry) => sum + entry.cost, 0);
      while (
        entries.length &&
        (used + cost > this.maxBytes || entries.length >= this.maxEntries)
      ) {
        const oldest = entries.shift()!;
        await remove(oldest);
        used -= oldest.cost;
      }
      temporary = join(this.directory, '.pending-' + randomUUID());
      await writeFile(temporary, image.body, { flag: 'wx', mode: 0o600 });
      await rename(temporary, this.file(key));
      temporary = undefined;
      const now = Date.now();
      index
        .prepare('INSERT OR REPLACE INTO entries VALUES (?,?,?,?,?,?,?)')
        .run(
          key,
          image.body.length,
          cost,
          image.contentType,
          digest(image.body),
          now + this.ttlMs,
          now,
        );
      index.exec('COMMIT');
      transaction = false;
      return true;
    } catch {
      if (transaction) {
        try {
          index.exec('ROLLBACK');
        } catch {
          /* Cache recovery remains optional. */
        }
      }
      return false;
    } finally {
      if (temporary) await unlink(temporary).catch(() => {});
    }
  }

  stats() {
    const index = this.database();
    const row = index
      ?.prepare(
        'SELECT count(*) entries,coalesce(sum(cost),0) allocated_bytes FROM entries',
      )
      .get() as { entries: number; allocated_bytes: number } | undefined;
    return {
      entries: row?.entries || 0,
      allocated_bytes: row?.allocated_bytes || 0,
      content_limit: this.maxBytes,
      total_limit: PREVIEW_CACHE_LIMIT,
    };
  }

  close() {
    this.index?.close();
    this.index = undefined;
  }
}
