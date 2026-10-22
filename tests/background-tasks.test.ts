import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startBackgroundTasks } from '../lib/background-tasks';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test('background tasks continue past a failed item, retry later, and stop when the trip closes', async (t) => {
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    configurable: true,
  });
  (globalThis as any).document = { visibilityState: 'visible' };
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const controller = new AbortController();
  const order: string[] = [];
  let attempts = 0;
  const stop = startBackgroundTasks(
    [
      {
        run: async () => {
          order.push('first');
          if (++attempts === 1) throw Error('Temporary failure');
        },
      },
      {
        run: async () => {
          order.push('second');
          return [
            {
              run: async () => {
                order.push('followup');
              },
            },
          ];
        },
      },
    ],
    controller.signal,
  );
  try {
    t.mock.timers.tick(500);
    await flush();
    t.mock.timers.tick(500);
    await flush();
    assert.deepEqual(order, ['first', 'second']);
    t.mock.timers.tick(500);
    await flush();
    t.mock.timers.tick(10000);
    await flush();
    assert.deepEqual(order, ['first', 'second', 'followup', 'first']);
    const cancelled = new AbortController();
    const stopCancelled = startBackgroundTasks(
      [
        {
          run: async () => {
            order.push('cancelled');
          },
        },
      ],
      cancelled.signal,
    );
    cancelled.abort();
    t.mock.timers.tick(1000);
    await flush();
    assert.ok(!order.includes('cancelled'));
    stopCancelled();
  } finally {
    controller.abort();
    stop();
    t.mock.timers.reset();
    delete (globalThis as any).document;
    if (nav) Object.defineProperty(globalThis, 'navigator', nav);
    else delete (globalThis as any).navigator;
  }
});
