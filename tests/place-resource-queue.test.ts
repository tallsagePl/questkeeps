import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  queuePlaceResource,
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
    let finish!: () => void,
      count = 0;
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
