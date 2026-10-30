import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VideoStore, videoKey } from '../lib/video-store';
import { conversionPlan, VideoFailure } from '../lib/video-convert';

const key = (n: number) => String(n).padStart(64, '0');

test('video queue deduplicates and one OS-backed writer lock spans multiple processes/connections', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qk-video-'));
  const first = new VideoStore(dir);
  const second = new VideoStore(dir);
  try {
    assert.equal(first.enqueue(key(1), 'one').state, 'pending');
    assert.equal(second.enqueue(key(1), 'one').state, 'pending');
    const release = first.workerLock()!;
    assert.ok(release);
    assert.equal(second.workerLock(), null);
    const child = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `import {VideoStore} from './lib/video-store.ts';const s=new VideoStore(${JSON.stringify(dir)});const release=s.workerLock();console.log(release?'acquired':'blocked');release?.();s.close();`,
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout.trim(), 'blocked');
    release();
    const next = second.workerLock()!;
    assert.ok(next);
    next();
    first.stage(key(1), 'download');
    writeFileSync(first.file(key(1), 'input'), 'partial');
    first.recover();
    assert.equal(first.job(key(1))?.state, 'pending');
    assert.equal(existsSync(first.file(key(1), 'input')), false);
    first.stage(key(1), 'encode');
    first.recover();
    assert.equal(
      first.job(key(1))?.state,
      'error',
      'a second crashed attempt is terminal',
    );
  } finally {
    first.close();
    second.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('video eviction respects active readers and leaves headroom for temporary inputs and outputs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qk-video-'));
  const store = new VideoStore(dir, 9 * 1024 * 1024, 512 * 1024);
  try {
    for (let n = 1; n <= 4; n++) {
      store.enqueue(key(n), String(n));
      writeFileSync(store.file(key(n), 'mp4'), Buffer.alloc(160 * 1024));
      writeFileSync(store.file(key(n), 'jpg'), Buffer.alloc(4096));
      store.ready(key(n));
    }
    const lease = store.lease(key(1))!;
    assert.ok(lease);
    store.reserve();
    assert.equal(store.job(key(1))?.state, 'ready');
    assert.equal(existsSync(store.file(key(1), 'mp4')), true);
    assert.equal(store.job(key(2)), undefined);
    lease.release();
    const sum = (
      store.index
        .prepare(
          "SELECT coalesce(sum(bytes),0) n FROM jobs WHERE state='ready'",
        )
        .get() as { n: number }
    ).n;
    assert.ok(sum + 512 * 1024 + 8 * 1024 * 1024 <= 9 * 1024 * 1024);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('file identity includes account, resource, revision and path; codec planning preserves portrait and rejects unsupported limits', () => {
  const base = {
    account_id: 'a',
    resource_id: 'r',
    path: 'disk:/a',
    revision: '1',
  };
  for (const patch of [
    { account_id: 'b' },
    { resource_id: 'b' },
    { path: 'disk:/b' },
    { revision: '2' },
  ])
    assert.notEqual(videoKey(base), videoKey({ ...base, ...patch }));
  const probe = {
    streams: [
      {
        codec_type: 'video',
        codec_name: 'h264',
        width: 640,
        height: 360,
        pix_fmt: 'yuv420p',
        sample_aspect_ratio: '1:1',
      },
    ],
    format: { duration: '2' },
  };
  assert.equal(conversionPlan(probe).native, true);
  assert.equal(
    conversionPlan({
      ...probe,
      streams: [{ ...probe.streams[0], codec_name: 'hevc' }],
    }).native,
    false,
  );
  assert.equal(
    conversionPlan({
      ...probe,
      streams: [{ ...probe.streams[0], side_data_list: [{ rotation: 90 }] }],
    }).native,
    false,
  );
  assert.ok(
    conversionPlan({
      ...probe,
      streams: [{ ...probe.streams[0], color_transfer: 'smpte2084' }],
    }).filter.includes('tonemap'),
  );
  assert.throws(
    () => conversionPlan({ ...probe, format: { duration: '301' } }),
    (e: unknown) => e instanceof VideoFailure && e.key === 'video.tooLong',
  );
});
