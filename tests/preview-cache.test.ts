import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { previewBlob, clearPreviewCache } from '../lib/preview-cache';

test('a slow browser-cache write does not delay the image; logout clears an in-flight write', async () => {
  const old = {
    fetch: globalThis.fetch,
    caches: globalThis.caches,
    Image: globalThis.Image,
    location: globalThis.location,
  };
  let release!: () => void;
  const slowWrite = new Promise<void>((resolve) => (release = resolve));
  let began!: () => void;
  const writing = new Promise<void>((resolve) => (began = resolve));
  let removed = 0;
  const cache = {
    keys: async () => [],
    match: async () => undefined,
    put: async () => {
      began();
      await slowWrite;
    },
    delete: async () => {
      removed++;
      return true;
    },
  };
  Object.assign(globalThis, {
    location: { origin: 'http://localhost:3000' },
    Image: class {
      src = '';
      async decode() {}
    },
    caches: {
      open: async () => cache,
      keys: async () => [],
      delete: async () => true,
    },
    fetch: async () =>
      new Response(new Blob(['fixture'], { type: 'image/png' }), {
        headers: { 'Content-Type': 'image/png' },
      }),
  });
  try {
    let displayed = false;
    const loaded = previewBlob(
      '/api/media/fixture/preview',
      'user:fixture',
    ).then((blob) => {
      displayed = true;
      return blob;
    });
    await writing;
    await setImmediate();
    assert.equal(
      displayed,
      true,
      'rendering must not wait for CacheStorage.put',
    );
    assert.equal((await loaded).size, 7);
    await clearPreviewCache();
    release();
    await setImmediate();
    await setImmediate();
    assert.equal(
      removed,
      1,
      'a late write from the previous session is deleted',
    );
  } finally {
    release();
    await clearPreviewCache();
    Object.assign(globalThis, old);
  }
});
