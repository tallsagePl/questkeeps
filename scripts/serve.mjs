import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const mode = process.argv[2] || 'dev';
const extra = process.argv.slice(3);
const cli = fileURLToPath(
  new URL('../node_modules/next/dist/bin/next', import.meta.url),
);
const server = spawn(
  process.execPath,
  [cli, mode, '--hostname', '127.0.0.1', ...extra],
  { stdio: 'inherit', env: process.env, windowsHide: true },
);
const worker = spawn(
  process.execPath,
  ['--import', 'tsx', fileURLToPath(new URL('./worker.ts', import.meta.url))],
  { stdio: 'inherit', env: process.env, windowsHide: true },
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  server.kill();
  worker.kill();
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
server.on('exit', (code) => stop(code || 0));
worker.on('exit', (code) => {
  if (!stopping) {
    console.error('Синхронизация остановилась. Код:', code);
    stop(code || 1);
  }
});
for (const child of [server, worker])
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
