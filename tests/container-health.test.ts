import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

test('deployment readiness rejects missing public assets and a failed API before switching traffic', async () => {
  let apiStatus = 200;
  let assetStatus = 200;
  let assetChecks = 0;
  const server = createServer((req, res) => {
    if (req.url === '/api/me') {
      res.writeHead(apiStatus, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ user: null }));
    } else if (req.url === '/_next/static/fixture.js') {
      assetChecks++;
      res.writeHead(assetStatus, { 'content-type': 'application/javascript' });
      res.end('');
    } else {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><script src="/_next/static/fixture.js"></script></html>');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = 'http://127.0.0.1:' + address.port;
  const check = () =>
    new Promise<number | null>((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/container-health.mjs'], {
        env: { ...process.env, HEALTH_URL: base, HEALTH_ASSET_BASE: base },
        stdio: 'ignore',
        windowsHide: true,
      });
      child.once('error', reject);
      child.once('exit', resolve);
    });
  try {
    assert.equal(await check(), 0);
    assert.ok(assetChecks > 0);
    assetStatus = 403;
    assert.equal(await check(), 1);
    assetStatus = 200;
    apiStatus = 503;
    assert.equal(await check(), 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
