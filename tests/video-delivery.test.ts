import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.DATABASE_PATH = './data/video-delivery-' + randomUUID() + '.sqlite';

process.env.TOKEN_ENCRYPTION_KEY = '45'.repeat(32);

const { db, run, encrypt } = await import('../lib/db');

const { fetchMedia } = await import('../lib/yandex');

after(() => db.close());

run(
  'INSERT INTO users VALUES (?,?,?,?,?)',
  'owner',
  'video@fixture.invalid',
  'Owner',
  null,
  Date.now(),
);

run(
  'INSERT INTO accounts(id,user_id,yandex_id,label,token,disk_enabled) VALUES (?,?,?,?,?,1)',
  'account',
  'owner',
  'fixture',
  'Fixture',
  encrypt('dummy'),
);

const media = {
  account_id: 'account',
  resource_id: 'video',
  path: 'disk:/fixture/movie.mov',
  kind: 'video',
  revision: '1',
};

test('video seeks reuse URLs, refresh expired URLs, and never bypass a disconnected account', async () => {
  const original = globalThis.fetch;
  let metadata = 0;
  let downloads = 0;
  let expire = false;
  const ranges: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'cloud-api.yandex.net') {
      metadata++;
      assert.equal(
        new Headers(init?.headers).get('authorization'),
        'OAuth dummy',
      );
      return Response.json({
        href: 'https://downloader.disk.yandex.ru/file/' + metadata,
      });
    }
    downloads++;
    assert.equal(new Headers(init?.headers).get('authorization'), null);
    ranges.push(new Headers(init?.headers).get('range')!);
    if (expire && url.pathname === '/file/1')
      return new Response(null, { status: 403 });
    return new Response(new Uint8Array([1, 2]), {
      status: 206,
      headers: { 'Content-Range': 'bytes 0-1/100', 'Content-Length': '2' },
    });
  };
  try {
    await (await fetchMedia(media, false, 'bytes=0-1')).arrayBuffer();
    await (await fetchMedia(media, false, 'bytes=-2')).arrayBuffer();
    assert.equal(metadata, 1);
    assert.deepEqual(ranges, ['bytes=0-1', 'bytes=-2']);
    expire = true;
    await (await fetchMedia(media, false, 'bytes=50-51')).arrayBuffer();
    assert.equal(metadata, 2);
    assert.equal(downloads, 4);
    await fetchMedia(media, false, 'bytes=0-1', undefined, true);
    assert.equal(metadata, 3, 'manual reload bypasses the cached URL');
    await fetchMedia({ ...media, revision: '2' }, false, 'bytes=0-1');
    assert.equal(metadata, 4, 'a changed file cannot inherit an old URL');
    run('UPDATE accounts SET disk_enabled=0 WHERE id=?', 'account');
    await assert.rejects(fetchMedia(media, false, 'bytes=0-1'));
    assert.equal(metadata, 4);
    assert.equal(downloads, 6);
  } finally {
    globalThis.fetch = original;
  }
});

test('video API preserves byte ranges and rechecks guest access after opening the upstream stream', async () => {
  const { NextRequest } = await import('next/server');
  const { handle } = await import('../lib/api');
  const { hash } = await import('../lib/db');
  process.env.APP_URL = 'http://localhost:3000';
  run('UPDATE accounts SET disk_enabled=1 WHERE id=?', 'account');
  run(
    'INSERT INTO trips(id,owner_id,title,destination,start,end,share_hash,created) VALUES (?,?,?,?,?,?,?,?)',
    'trip',
    'owner',
    'Video',
    '',
    '2026-10-10',
    '2026-10-18',
    hash('guest'),
    Date.now(),
  );
  run(
    'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,1)',
    'source',
    'trip',
    'owner',
    'account',
    'disk:/fixture',
  );
  run(
    'INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    'movie',
    'source',
    'trip',
    'owner',
    'api-video',
    'disk:/fixture/api.mov',
    'api.mov',
    'video/quicktime',
    'video',
    '2026-10-11',
    'manual',
  );
  let upstream = 0;
  let revoke = false;
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (new URL(String(input)).hostname === 'cloud-api.yandex.net')
      return Response.json({
        href: 'https://downloader.disk.yandex.ru/api-file',
      });
    upstream++;
    if (revoke) run('UPDATE trips SET share_hash=NULL WHERE id=?', 'trip');
    const range = new Headers(init?.headers).get('range');
    return range === 'bytes=1000-'
      ? new Response(null, {
          status: 416,
          headers: { 'Content-Range': 'bytes */100' },
        })
      : new Response(new Uint8Array([1, 2]), {
          status: 206,
          headers: {
            'Content-Length': '2',
            'Content-Range': 'bytes 0-1/100',
            'Accept-Ranges': 'bytes',
          },
        });
  };
  const request = (range: string) =>
    handle(
      new NextRequest(
        'http://localhost:3000/api/media/movie/original?share=guest',
        { headers: { Range: range } },
      ),
      ['media', 'movie', 'original'],
    );
  try {
    const response = await request('bytes=0-1');
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 0-1/100');
    assert.equal(response.headers.get('content-type'), 'video/quicktime');
    assert.match(response.headers.get('cache-control')!, /private, no-store/);
    assert.equal((await response.arrayBuffer()).byteLength, 2);
    const outside = await request('bytes=1000-');
    assert.equal(outside.status, 416);
    assert.equal(outside.headers.get('content-range'), 'bytes */100');
    assert.equal((await request('bytes=-')).status, 416);
    assert.equal(upstream, 2, 'malformed ranges never reach Yandex');
    revoke = true;
    assert.equal((await request('bytes=0-1')).status, 404);
  } finally {
    globalThis.fetch = original;
  }
});
