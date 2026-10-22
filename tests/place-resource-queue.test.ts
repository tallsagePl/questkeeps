import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  queuePlaceResource,
  promotePlaceResource,
  retryPlaceWhenIdle,
} from '../lib/place-resource-queue';
import { queuePreview } from '../lib/preview-queue';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test('idle retries wait for resource and preview queues, obey visibility and can be cancelled', async (t) => {
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    configurable: true,
  });
  (globalThis as any).document = { visibilityState: 'visible' };
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    let finish!: () => void;
    let count = 0;
    const foreground = queuePlaceResource(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await flush();
    const cancel = retryPlaceWhenIdle(() => count++, 10000);
    t.mock.timers.tick(10000);
    assert.equal(count, 0);
    finish();
    await foreground;
    await flush();
    let previewDone!: (b: Blob) => void;
    const preview = queuePreview(
      'idle-test',
      0,
      () =>
        new Promise((resolve) => {
          previewDone = resolve;
        }),
    );
    await flush();
    t.mock.timers.tick(500);
    assert.equal(count, 0);
    previewDone(new Blob(['image']));
    await preview.promise;
    await flush();
    preview.release();
    (globalThis as any).document.visibilityState = 'hidden';
    t.mock.timers.tick(500);
    assert.equal(count, 0);
    (globalThis as any).document.visibilityState = 'visible';
    t.mock.timers.tick(500);
    assert.equal(count, 1);
    cancel();
    const cancelled = retryPlaceWhenIdle(() => count++, 1000);
    cancelled();
    t.mock.timers.tick(2000);
    assert.equal(count, 1);
  } finally {
    t.mock.timers.reset();
    delete (globalThis as any).document;
    if (nav) Object.defineProperty(globalThis, 'navigator', nav);
    else delete (globalThis as any).navigator;
  }
});

test('background work reserves foreground slots and queued resources can be promoted', async () => {
  const started: string[] = [];
  const finish = new Map<string, () => void>();
  const add = (key: string, priority: number) =>
    queuePlaceResource(
      () =>
        new Promise<void>((resolve) => {
          started.push(key);
          finish.set(key, resolve);
        }),
      priority,
      key,
    );
  const a = add('background-a', 2);
  const b = add('background-b', 2);
  const c = add('promoted', 2);
  const d = add('background-d', 2);
  const visible = add('visible', 0);
  try {
    await flush();
    assert.deepEqual(started, ['background-a', 'background-b', 'visible']);
    promotePlaceResource('promoted');
    await flush();
    assert.ok(started.includes('promoted'));
    assert.ok(!started.includes('background-d'));
    finish.get('visible')!();
    finish.get('promoted')!();
    await flush();
    finish.get('background-a')!();
    await flush();
    assert.ok(started.includes('background-d'));
  } finally {
    for (const complete of finish.values()) complete();
    await Promise.all([a, b, c, d, visible]);
  }
});
