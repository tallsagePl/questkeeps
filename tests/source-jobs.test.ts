import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

process.env.DATABASE_PATH = './data/source-jobs-' + randomUUID() + '.sqlite';

const { db, run, one, encrypt } = await import('../lib/db');

const { syncSource, syncDue } = await import('../lib/sync');

const { queueSourceSync, sourceJobStatus } = await import('../lib/source-jobs');

const { runMetadataJobs } = await import('../lib/metadata-jobs');

const { session } = await import('../lib/access');

const { handle } = await import('../lib/api');

after(() => db.close());

function setup() {
  const source = randomUUID();
  run(
    'INSERT INTO users(id,email,name,created) VALUES (?,?,?,?)',
    source,
    source + '@fixture.invalid',
    'Fixture',
    Date.now(),
  );
  run(
    'INSERT INTO trips(id,owner_id,title,destination,start,end,created) VALUES (?,?,?,?,?,?,?)',
    source,
    source,
    'Fixture',
    'Fixture',
    '2026-10-10',
    '2026-10-18',
    Date.now(),
  );
  run(
    'INSERT INTO accounts(id,user_id,yandex_id,label,token,disk_enabled) VALUES (?,?,?,?,?,1)',
    source,
    source,
    source,
    'Fixture',
    encrypt('fixture-token'),
  );
  run(
    'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,1)',
    source,
    source,
    source,
    source,
    'disk:/fixture',
  );
  return source;
}

function resource(revision = 1) {
  return {
    type: 'file',
    path: 'disk:/fixture/photo.jpg',
    resource_id: 'photo',
    name: 'photo.jpg',
    mime_type: 'image/jpeg',
    created: '2026-11-10',
    revision,
  };
}

async function scan(source: string, resources = [resource()]) {
  globalThis.fetch = async () =>
    Response.json({
      type: 'dir',
      _embedded: { items: resources, total: resources.length },
    });
  return syncSource(source);
}

function reading(bytes: Uint8Array, hook?: () => void) {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'cloud-api.yandex.net')
      return Response.json({
        href: 'https://downloader.disk.yandex.net/disk/fixture',
      });
    assert.equal(new Headers(init?.headers).get('Range'), 'bytes=0-524287');
    hook?.();
    return new Response(new Uint8Array(bytes).buffer, { status: 206 });
  };
}

function prioritize(source: string) {
  run(
    'UPDATE metadata_jobs SET next_attempt=-1,updated=0 WHERE source_id=?',
    source,
  );
}

function exifJpeg() {
  const tiff = Buffer.alloc(178);
  tiff.write('II', 0);
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  function entry(
    offset: number,
    tag: number,
    type: number,
    count: number,
    value: number,
  ) {
    tiff.writeUInt16LE(tag, offset);
    tiff.writeUInt16LE(type, offset + 2);
    tiff.writeUInt32LE(count, offset + 4);
    tiff.writeUInt32LE(value, offset + 8);
  }
  tiff.writeUInt16LE(2, 8);
  entry(10, 0x8769, 4, 1, 38);
  entry(22, 0x8825, 4, 1, 56);
  tiff.writeUInt16LE(1, 38);
  entry(40, 0x9003, 2, 20, 110);
  tiff.writeUInt16LE(4, 56);
  entry(58, 1, 2, 2, 78);
  entry(70, 2, 5, 3, 130);
  entry(82, 3, 2, 2, 69);
  entry(94, 4, 5, 3, 154);
  tiff.write('2026:10:13 00:30:00\0', 110, 'ascii');
  for (const [offset, nums] of [
    [130, [41, 42, 0]],
    [154, [44, 48, 0]],
  ] as [number, number[]][]) {
    for (let i = 0; i < 3; i++) {
      tiff.writeUInt32LE(nums[i], offset + i * 8);
      tiff.writeUInt32LE(1, offset + i * 8 + 4);
    }
  }
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 4);
  const jpeg = Buffer.concat([header, payload, Buffer.from([0xff, 0xd9])]);
  return jpeg;
}

test('HTTP queues and deduplicates work without contacting Drive; status remains private', async () => {
  const s = setup();
  let external = 0;
  globalThis.fetch = async () => {
    external++;
    throw Error('Must not fetch');
  };
  const cookie = 'ta_session=' + session(s);
  const request = (path: string, method = 'GET', token = cookie) =>
    handle(
      new NextRequest('http://localhost:3000/api/' + path, {
        method,
        headers: { origin: 'http://localhost:3000', cookie: token },
      }),
      path.split('/'),
    );
  const first = await request('trips/' + s + '/sync', 'POST');
  assert.equal(first.status, 202);
  assert.equal((await first.json()).queued, 1);
  const initial = one('SELECT id FROM source_jobs WHERE source_id=?', s)!.id;
  assert.equal(queueSourceSync(s).jobId, initial);
  assert.equal(external, 0);
  assert.equal((await request('trips/' + s + '/sync')).status, 200);
  assert.equal((await request('trips/' + s + '/sync', 'GET', '')).status, 401);
  assert.ok(sourceJobStatus(s, s, true).active);
  run('UPDATE accounts SET disk_enabled=0 WHERE id=?', s);
  assert.equal(sourceJobStatus(s, s, true).active, false);
  assert.throws(() => queueSourceSync(s));
});

test('failed EXIF retries the same revision and recovers a photo whose upload date is outside the trip', async () => {
  const s = setup();
  await scan(s);
  prioritize(s);
  assert.equal(one('SELECT id FROM media WHERE source_id=?', s), undefined);
  globalThis.fetch = async (input) =>
    String(input).includes('cloud-api.yandex.net')
      ? Response.json({
          href: 'https://downloader.disk.yandex.net/disk/fixture',
        })
      : new Response('', { status: 403 });
  await runMetadataJobs();
  let job = one('SELECT * FROM metadata_jobs WHERE source_id=?', s)!;
  assert.equal(job.state, 'retryable-error');
  assert.equal(job.attempts, 1);
  assert.ok(job.next_attempt > Date.now());
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error('Backoff');
  };
  await runMetadataJobs();
  assert.equal(calls, 0);
  await scan(s);
  job = one('SELECT * FROM metadata_jobs WHERE source_id=?', s)!;
  assert.equal(job.attempts, 1);
  assert.equal(job.state, 'retryable-error');
  prioritize(s);
  reading(exifJpeg());
  await runMetadataJobs();
  const m = one('SELECT * FROM media WHERE source_id=?', s)!;
  assert.equal(m.taken, '2026-10-13');
  assert.ok(Math.abs(m.lat - 41.7) < 0.0001);
  assert.equal(
    one('SELECT state FROM metadata_jobs WHERE source_id=?', s)?.state,
    'complete',
  );
  await scan(s);
  assert.equal(
    one('SELECT taken FROM media WHERE source_id=?', s)?.taken,
    '2026-10-13',
  );
  assert.equal(
    one('SELECT state FROM metadata_jobs WHERE source_id=?', s)?.state,
    'complete',
  );
});

test('manual coordinates set while EXIF is being read survive publication and revision changes', async () => {
  const s = setup();
  await scan(s, [{ ...resource(), created: '2026-10-13' }]);
  prioritize(s);
  const mid = one('SELECT id FROM media WHERE source_id=?', s)!.id;
  reading(exifJpeg(), () => {
    run('UPDATE media SET lat=10,lon=20 WHERE id=?', mid);
    run(
      'INSERT INTO media_location_overrides VALUES (?,?,?) ON CONFLICT(media_id) DO UPDATE SET lat=excluded.lat,lon=excluded.lon',
      mid,
      10,
      20,
    );
  });
  await runMetadataJobs();
  assert.equal(one('SELECT lat FROM media WHERE id=?', mid)?.lat, 10);
  await scan(s, [{ ...resource(2), created: '2026-10-13' }]);
  prioritize(s);
  reading(exifJpeg());
  await runMetadataJobs();
  assert.equal(one('SELECT lat FROM media WHERE id=?', mid)?.lat, 10);
  assert.equal(one('SELECT lon FROM media WHERE id=?', mid)?.lon, 20);
});

test('files without EXIF settle once; errors exhaust and a manual refresh explicitly retries', async () => {
  const s = setup();
  await scan(s, [
    { ...resource(), mime_type: 'image/png', created: '2026-10-13' },
  ]);
  prioritize(s);
  const sharp = (await import('sharp')).default;
  reading(
    await sharp({
      create: { width: 2, height: 2, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer(),
  );
  await runMetadataJobs();
  assert.equal(
    one('SELECT state FROM metadata_jobs WHERE source_id=?', s)?.state,
    'no-metadata',
  );
  await scan(s, [
    { ...resource(), mime_type: 'image/png', created: '2026-10-13' },
  ]);
  globalThis.fetch = async () => {
    throw Error('No second metadata read');
  };
  await runMetadataJobs();
  assert.equal(
    one('SELECT attempts FROM metadata_jobs WHERE source_id=?', s)?.attempts,
    1,
  );
  await scan(s, [resource(2)]);
  prioritize(s);
  run('UPDATE metadata_jobs SET attempts=5 WHERE source_id=?', s);
  reading(new Uint8Array([1, 2, 3]));
  await runMetadataJobs();
  assert.equal(
    one('SELECT state FROM metadata_jobs WHERE source_id=?', s)?.state,
    'exhausted',
  );
  queueSourceSync(s);
  assert.equal(
    one('SELECT state FROM metadata_jobs WHERE source_id=?', s)?.state,
    'pending',
  );
  run('UPDATE accounts SET disk_enabled=0 WHERE id=?', s);
});

test('revocation, exclusion and changed revisions during an EXIF read cannot publish stale media', async () => {
  for (const mode of ['revoke', 'exclude', 'revision']) {
    const s = setup();
    await scan(s);
    prioritize(s);
    reading(exifJpeg(), () => {
      if (mode === 'revoke') run('UPDATE sources SET approved=0 WHERE id=?', s);
      if (mode === 'exclude')
        run(
          'INSERT INTO media_exclusions VALUES (?,?,?,?)',
          s,
          s,
          'photo',
          Date.now(),
        );
      if (mode === 'revision')
        run(
          "UPDATE metadata_jobs SET revision='2',state='pending',lock_id=NULL,lock_until=0 WHERE source_id=?",
          s,
        );
    });
    await runMetadataJobs();
    assert.equal(one('SELECT id FROM media WHERE source_id=?', s), undefined);
    run('UPDATE accounts SET disk_enabled=0 WHERE id=?', s);
  }
});

test('partial scans leave old media visible; source errors back off; expired leases recover', async () => {
  const s = setup();
  await scan(s, [{ ...resource(), created: '2026-10-13' }]);
  globalThis.fetch = async () => new Response('', { status: 403 });
  await assert.rejects(() => syncSource(s));
  assert.equal(
    one('SELECT missing FROM media WHERE source_id=?', s)?.missing,
    0,
  );
  const job = one('SELECT * FROM source_jobs WHERE source_id=?', s)!;
  assert.equal(job.state, 'error');
  assert.ok(job.next_run > Date.now());
  assert.equal(queueSourceSync(s, false).busy, true);
  run(
    "UPDATE source_jobs SET state='scanning',next_run=0 WHERE source_id=?",
    s,
  );
  run(
    'UPDATE sources SET lock_id=?,lock_until=? WHERE id=?',
    'crashed',
    Date.now() - 1,
    s,
  );
  globalThis.fetch = async () =>
    Response.json({ type: 'dir', _embedded: { items: [], total: 0 } });
  await syncDue();
  assert.equal(
    one('SELECT state FROM source_jobs WHERE source_id=?', s)?.state,
    'complete',
  );
  assert.equal(
    one('SELECT missing FROM media WHERE source_id=?', s)?.missing,
    1,
  );
});

test('shutdown requeues a metadata task without consuming attempts', async () => {
  const s = setup();
  await scan(s);
  prioritize(s);
  const stop = new AbortController();
  reading(exifJpeg(), () => stop.abort());
  await runMetadataJobs(stop.signal);
  const job = one('SELECT * FROM metadata_jobs WHERE source_id=?', s)!;
  assert.equal(job.state, 'pending');
  assert.equal(job.attempts, 0);
  assert.equal(job.lock_until, 0);
  run('UPDATE accounts SET disk_enabled=0 WHERE id=?', s);
});

test('a killed metadata worker consumes an attempt and eventually reaches a terminal state', async () => {
  const source = setup();
  await scan(source);
  run(
    "UPDATE metadata_jobs SET state='processing',attempts=6,lock_id='dead',lock_until=? WHERE source_id=?",
    Date.now() - 1,
    source,
  );
  globalThis.fetch = async () => {
    throw Error('No network for an exhausted crash');
  };
  await runMetadataJobs();
  const job = one('SELECT * FROM metadata_jobs WHERE source_id=?', source)!;
  assert.equal(job.state, 'exhausted');
  assert.equal(job.lock_until, 0);
  run('UPDATE accounts SET disk_enabled=0 WHERE id=?', source);
});

test('additive schema rollback retains queue state and protected coordinates', async () => {
  const { spawnSync } = await import('node:child_process');
  const { migrate } = await import('../lib/migrations');
  const source = setup();
  await scan(source, [{ ...resource(), created: '2026-10-13' }]);
  const mid = one('SELECT id FROM media WHERE source_id=?', source)!.id;
  run('INSERT INTO media_location_overrides VALUES (?,?,?)', mid, 12, 34);
  const before = one(
    'SELECT state,revision FROM metadata_jobs WHERE source_id=?',
    source,
  );
  const rolled = spawnSync(
    process.platform === 'win32' ? 'python' : 'python3',
    ['deploy/media-archive-schema.py', process.env.DATABASE_PATH!, '12'],
    { encoding: 'utf8', windowsHide: true },
  );
  assert.equal(rolled.status, 0, rolled.stderr);
  assert.equal(db.pragma('user_version', { simple: true }), 12);
  assert.deepEqual(
    one('SELECT state,revision FROM metadata_jobs WHERE source_id=?', source),
    before,
  );
  migrate(db);
  assert.equal(db.pragma('user_version', { simple: true }), 13);
  assert.equal(
    one('SELECT lat FROM media_location_overrides WHERE media_id=?', mid)?.lat,
    12,
  );
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  run('UPDATE accounts SET disk_enabled=0 WHERE id=?', source);
});
