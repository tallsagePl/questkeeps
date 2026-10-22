import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve(process.env.DATABASE_PATH || './data/travel.sqlite');

const folder = resolve('./data/backups');

mkdirSync(folder, { recursive: true });

const target = resolve(
  folder,
  'travel-' + new Date().toISOString().replace(/[:.]/g, '-') + '.sqlite',
);

const db = new Database(source, { fileMustExist: true });

await db.backup(target);

db.close();

console.log('SQLite backup created: ' + target);
