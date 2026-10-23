import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWorkerLoops } from '../lib/worker-loops';

test('mail keeps running while Drive sync is waiting; task failures do not stop other loops', async () => {
  const stop = new AbortController();
  let mail = 0;
  let sync = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const errors: string[] = [];
  await runWorkerLoops(
    [
      {
        name: 'email',
        intervalMs: 1,
        run: async () => {
          mail++;
          if (mail === 1) throw Error('temporary');
          if (mail === 3) {
            stop.abort();
            release();
          }
        },
      },
      {
        name: 'sync',
        intervalMs: 1,
        run: async () => {
          sync++;
          await gate;
        },
      },
    ],
    stop.signal,
    (name) => errors.push(name),
  );
  assert.equal(mail, 3);
  assert.equal(sync, 1);
  assert.deepEqual(errors, ['email']);
});
