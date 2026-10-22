import { migrate } from './migrations';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
export type Row = Record<string, any>;
const filename = resolve(
  /* turbopackIgnore: true */ process.env.DATABASE_PATH ||
    './data/travel.sqlite',
);
mkdirSync(dirname(filename), { recursive: true });
const globalDB = globalThis as unknown as { travelDB?: Database.Database };
export const db = globalDB.travelDB || new Database(filename);
globalDB.travelDB = db;
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.function('quest_fold', { deterministic: true }, (value: unknown) =>
  String(value || '')
    .normalize('NFKC')
    .toLowerCase(),
);
db.pragma('busy_timeout = 5000');
migrate(db);

export function one(sql: string, ...args: any[]): Row | undefined {
  return db.prepare(sql).get(...args) as Row | undefined;
}
export function all(sql: string, ...args: any[]): Row[] {
  return db.prepare(sql).all(...args) as Row[];
}
export function run(sql: string, ...args: any[]) {
  return db.prepare(sql).run(...args);
}
export const id = () => randomBytes(18).toString('base64url');
export const token = () => randomBytes(32).toString('base64url');
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function key() {
  const v = process.env.TOKEN_ENCRYPTION_KEY;
  if (!v || !/^[a-f0-9]{64}$/i.test(v))
    throw new Error('TOKEN_ENCRYPTION_KEY must contain 64 hex characters');
  return Buffer.from(v, 'hex');
}
export function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}
export function decrypt(value: string) {
  const b = Buffer.from(value, 'base64');
  const cipher = createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
  cipher.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([
    cipher.update(b.subarray(28)),
    cipher.final(),
  ]).toString('utf8');
}
