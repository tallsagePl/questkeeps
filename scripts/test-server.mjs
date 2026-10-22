import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const scratch = resolve('data/test-server', randomUUID());

mkdirSync(scratch, { recursive: true });

const env = {};

for (const name of [
  'PATH',
  'Path',
  'SystemRoot',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
])
  if (process.env[name]) env[name] = process.env[name];

Object.assign(env, {
  HOME: scratch,
  USERPROFILE: scratch,
  TEMP: scratch,
  TMP: scratch,
  NODE_ENV: 'test',
  APP_URL: 'http://127.0.0.1:3101',
  DATABASE_PATH: resolve(scratch, 'fixture.sqlite'),
  TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32),
  YANDEX_CLIENT_ID: '',
  YANDEX_CLIENT_SECRET: '',
  CRON_SECRET: 'fixture-only-cron-secret',
  OVERPASS_ENDPOINT: 'http://127.0.0.1:1/disabled',
  NEXT_TELEMETRY_DISABLED: '1',
  QUESTKEEPS_E2E: '1',
});

env.NODE_OPTIONS =
  '--import=' + pathToFileURL(resolve('scripts/test-network.mjs')).href;

const server = spawn(
  process.execPath,
  [
    'node_modules/next/dist/bin/next',
    'dev',
    '--hostname',
    '127.0.0.1',
    '--port',
    '3101',
  ],
  { env, stdio: 'inherit', windowsHide: true },
);

process.on('SIGTERM', () => server.kill());

process.on('SIGINT', () => server.kill());

server.on('error', () => {
  process.exitCode = 1;
});

server.on('exit', (code) => {
  process.exitCode = code || 0;
});
