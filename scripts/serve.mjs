import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer, connect } from 'node:net';
const mode = process.argv[2] || 'dev',
  extra = process.argv.slice(3);
const cli = fileURLToPath(
  new URL('../node_modules/next/dist/bin/next', import.meta.url),
);
const portFlag = extra.indexOf('--port');
const port = Number(
  portFlag < 0 ? process.env.PORT || 3000 : extra[portFlag + 1],
);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error('Invalid port');
let stopping = false;
const children = new Set(),
  timers = new Set(),
  sockets = new Set();
// Both localhost address families remain loopback-only. Forward raw TCP so
// Next development WebSockets and request headers work without rewriting.
const ipv6 = createServer((socket) => {
  const upstream = connect({ host: '127.0.0.1', port });
  for (const stream of [socket, upstream]) {
    sockets.add(stream);
    stream.on('close', () => sockets.delete(stream));
    stream.on('error', () => {
      socket.destroy();
      upstream.destroy();
    });
  }
  socket.pipe(upstream);
  upstream.pipe(socket);
});
ipv6.on('error', (error) => {
  if (['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code))
    console.error('IPv6 loopback unavailable; IPv4 remains active.');
  else {
    console.error('Loopback listener failed:', error.code);
    stop(1);
  }
});
ipv6.listen({ host: '::1', port, ipv6Only: true });
function supervise(args, label) {
  if (stopping) return;
  const child = spawn(process.execPath, args, {
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  });
  children.add(child);
  child.on('error', () => console.error(label + ' could not start.'));
  child.on('exit', () => {
    children.delete(child);
    if (stopping) return;
    console.error(label + ' stopped; restarting in 5 seconds.');
    const timer = setTimeout(() => {
      timers.delete(timer);
      supervise(args, label);
    }, 5000);
    timers.add(timer);
  });
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const timer of timers) clearTimeout(timer);
  for (const child of children) child.kill();
  for (const socket of sockets) socket.destroy();
  ipv6.close();
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
supervise([cli, mode, '--hostname', '127.0.0.1', ...extra], 'Web server');
supervise(
  ['--import', 'tsx', fileURLToPath(new URL('./worker.ts', import.meta.url))],
  'Background worker',
);
