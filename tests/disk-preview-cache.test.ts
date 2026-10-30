import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiskPreviewCache, previewKey } from '../lib/disk-preview-cache';

const key = (id: string) =>
  previewKey({
    account_id: 'account',
    resource_id: id,
    path: 'disk:/' + id,
    revision: '1',
  });

const image = (value: number) => ({
  body: Buffer.alloc(4000, value),
  contentType: 'image/jpeg',
});

test('preview disk cache shares a bounded LRU budget across web instances', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qk-preview-'));
  const first = new DiskPreviewCache(directory, 8192);
  const second = new DiskPreviewCache(directory, 8192);
  try {
    assert.equal(await first.put(key('a'), image(1)), true);
    assert.equal(await second.put(key('b'), image(2)), true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal((await first.get(key('a')))?.body[0], 1);
    assert.equal(await second.put(key('c'), image(3)), true);
    assert.equal(await first.get(key('b')), undefined);
    assert.equal((await second.get(key('a')))?.body[0], 1);
    assert.equal(first.stats().allocated_bytes, 8192);
    const files = (await readdir(directory)).filter((name) =>
      name.endsWith('.preview'),
    );
    assert.equal(files.length, 2);
    assert.ok(
      (
        await Promise.all(
          files.map(async (name) => (await stat(join(directory, name))).size),
        )
      ).reduce((a, b) => a + b, 0) <= 8192,
    );
  } finally {
    first.close();
    second.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('expired, corrupt and abandoned previews are replaced without preserving secrets in filenames', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qk-preview-'));
  const cache = new DiskPreviewCache(directory, 8192, 2, 5);
  try {
    await cache.put(key('a'), image(1));
    await writeFile(join(directory, key('a') + '.preview'), 'corrupted');
    assert.equal(await cache.get(key('a')), undefined);
    await writeFile(join(directory, '.pending-1234'), 'abandoned');
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(await cache.get(key('a')), undefined);
    await cache.put(key('b'), image(2));
    assert.ok(!(await readdir(directory)).includes('.pending-1234'));
    assert.ok(!(await readdir(directory)).includes(key('a') + '.preview'));
    assert.notEqual(
      key('a'),
      previewKey({
        account_id: 'another-account',
        resource_id: 'a',
        path: 'disk:/a',
        revision: '1',
      }),
    );
    assert.notEqual(
      key('a'),
      previewKey({
        account_id: 'account',
        resource_id: 'a',
        path: 'disk:/a',
        revision: '2',
      }),
    );
  } finally {
    cache.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('concurrent writers cannot exceed the shared payload budget', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qk-preview-'));
  const first = new DiskPreviewCache(directory, 8192);
  const second = new DiskPreviewCache(directory, 8192);
  try {
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        (index % 2 ? first : second).put(key(String(index)), image(index)),
      ),
    );
    await first.put(key('last'), image(99));
    assert.ok(first.stats().allocated_bytes <= 8192);
    assert.ok(second.stats().allocated_bytes <= 8192);
    assert.equal((await second.get(key('last')))?.body[0], 99);
    assert.ok(
      (await readdir(directory)).filter((name) => name.endsWith('.preview'))
        .length <= 2,
    );
  } finally {
    first.close();
    second.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('an unavailable cache is optional and never writes outside its directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qk-preview-'));
  await writeFile(join(directory, 'unavailable'), 'not a directory');
  const cache = new DiskPreviewCache(join(directory, 'unavailable'));
  try {
    assert.equal(await cache.get(key('a')), undefined);
    assert.equal(await cache.put(key('a'), image(1)), false);
  } finally {
    cache.close();
    await rm(directory, { recursive: true, force: true });
  }
});
