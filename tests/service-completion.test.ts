import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';

process.env.DATABASE_PATH = './data/completion-' + randomUUID() + '.sqlite';

const { db, one, run, encrypt, hash } = await import('../lib/db');

const { session } = await import('../lib/access');

const { handle } = await import('../lib/api');

const { notificationSnapshot, readNotifications } =
  await import('../lib/notifications');

const { anniversaryMemories } = await import('../lib/memories');

const { queuedAreaSuggestions, runGeoJob } = await import('../lib/geo-jobs');

const { photoSearchRegions } = await import('../lib/photo-search-regions');

const { ProviderQueue, boundedProviderJson } =
  await import('../lib/provider-queue');

const { serverPreview, closePreviewCache } =
  await import('../lib/server-preview');

const { videoLocation } = await import('../lib/video-convert');

after(() => {
  closePreviewCache();
  db.close();
});

function setup() {
  const owner = randomUUID();
  const reader = randomUUID();
  const follower = randomUUID();
  const trip = randomUUID();
  const source = randomUUID();
  for (const user of [owner, reader, follower])
    run(
      'INSERT INTO users(id,email,name,created) VALUES (?,?,?,?)',
      user,
      user + '@fixture.invalid',
      'Fixture',
      Date.now(),
    );
  run(
    'INSERT INTO trips(id,owner_id,title,destination,start,end,share_hash,created) VALUES (?,?,?,?,?,?,?,?)',
    trip,
    owner,
    'Fixture trip',
    'Fixture',
    '2025-10-10',
    '2025-10-18',
    hash(trip),
    Date.now(),
  );
  run(
    'INSERT INTO members(trip_id,user_id,start,end) VALUES (?,?,?,?)',
    trip,
    reader,
    '2025-10-13',
    '2025-10-14',
  );
  run(
    'INSERT INTO accounts(id,user_id,yandex_id,label,token,disk_enabled) VALUES (?,?,?,?,?,1)',
    source,
    owner,
    source,
    'Fixture',
    encrypt('fixture'),
  );
  run(
    'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,1)',
    source,
    trip,
    owner,
    source,
    'disk:/fixture',
  );
  return { owner, reader, follower, trip, source };
}

function photo(f: ReturnType<typeof setup>, day = '2025-10-13', hidden = 0) {
  const mid = randomUUID();
  run(
    'INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis,hidden_from_guests,lat,lon,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    mid,
    f.source,
    f.trip,
    f.owner,
    mid,
    'disk:/fixture/' + mid,
    mid,
    'image/jpeg',
    'photo',
    day,
    'exif',
    hidden,
    41,
    28,
    '1',
  );
  return mid;
}

function request(userId: string, path: string, etag?: string) {
  return handle(
    new NextRequest('http://localhost:3000/api/' + path, {
      headers: {
        cookie: 'ta_session=' + session(userId),
        ...(etag ? { 'If-None-Match': etag } : {}),
      },
    }),
    path.split('?')[0].split('/'),
  );
}

test('unchanged trips return 304; content changes invalidate it and revoked membership never returns 304', async () => {
  const f = setup();
  photo(f);
  const first = await request(f.reader, 'trips/' + f.trip);
  assert.equal(first.status, 200);
  const etag = first.headers.get('etag')!;
  assert.ok(etag);
  const cached = await request(f.reader, 'trips/' + f.trip, etag);
  assert.equal(cached.status, 304);
  assert.equal(await cached.text(), '');
  photo(f);
  assert.equal((await request(f.reader, 'trips/' + f.trip, etag)).status, 200);
  run('UPDATE members SET active=0 WHERE trip_id=?', f.trip);
  assert.equal((await request(f.reader, 'trips/' + f.trip, etag)).status, 403);
});

test('follow notifications ignore hidden frames, include public photos and journal entries, and disappear on revocation', () => {
  const f = setup();
  photo(f);
  run(
    'INSERT INTO trip_follows VALUES (?,?,?,?)',
    f.follower,
    f.trip,
    hash(f.trip),
    Date.now(),
  );
  assert.equal(notificationSnapshot(f.follower).followChanges.length, 0);
  photo(f, '2025-10-13', 1);
  assert.equal(notificationSnapshot(f.follower).followChanges.length, 0);
  photo(f);
  let notice = notificationSnapshot(f.follower).followChanges[0];
  assert.equal(notice.count, 2);
  const key = 'follow:' + f.trip + ':' + notice.stamp;
  readNotifications(f.follower, [key]);
  assert.ok(notificationSnapshot(f.follower).seen.includes(key));
  run(
    'INSERT INTO notes(id,trip_id,user_id,day,text) VALUES (?,?,?,?,?)',
    randomUUID(),
    f.trip,
    f.owner,
    '2025-10-14',
    'New entry',
  );
  notice = notificationSnapshot(f.follower).followChanges[0];
  assert.equal(notice.notes, 1);
  assert.notEqual('follow:' + f.trip + ':' + notice.stamp, key);
  run('UPDATE trips SET share_hash=NULL WHERE id=?', f.trip);
  assert.equal(notificationSnapshot(f.follower).followChanges.length, 0);
});

test('anniversary memories respect participation dates and exclude guests, hidden frames and the current year', () => {
  const f = setup();
  const mid = photo(f);
  photo(f, '2025-10-11');
  assert.deepEqual(
    anniversaryMemories(f.reader, '2026-10-13').map((m) => m.id),
    [mid],
  );
  assert.deepEqual(anniversaryMemories(f.follower, '2026-10-13'), []);
  assert.deepEqual(anniversaryMemories(f.owner, '2025-10-13'), []);
  run('UPDATE media SET hidden=1 WHERE id=?', mid);
  assert.deepEqual(anniversaryMemories(f.owner, '2026-10-13'), []);
});

test('geography GET queues without external requests, publishes partial cached cells, and invalidates changed coordinates', async () => {
  const f = setup();
  const mid = photo(f);
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    throw Error('HTTP must not wait on provider');
  };
  try {
    const queued = queuedAreaSuggestions(f.trip, f.owner);
    assert.ok(queued.pending);
    assert.equal(calls, 0);
    const geometry = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { kind: 'district' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [27.99, 40.99],
                [28.01, 40.99],
                [28.01, 41.01],
                [27.99, 41.01],
                [27.99, 40.99],
              ],
            ],
          },
        },
      ],
    };
    const area = 'osm-relation-' + Date.now();
    run(
      'INSERT INTO map_areas VALUES (?,?,?,?,?,?,?,?,?)',
      area,
      'Fixture area',
      'district',
      'Fixture summary',
      'https://www.openstreetmap.org/relation/999',
      41,
      28,
      JSON.stringify(geometry),
      Date.now(),
    );
    for (const region of photoSearchRegions([{ lat: 41, lon: 28 }]))
      run(
        'INSERT OR REPLACE INTO map_area_city_cache VALUES (?,?,?)',
        region.key,
        JSON.stringify([area]),
        Date.now(),
      );
    await runGeoJob(new AbortController().signal);
    const result = queuedAreaSuggestions(f.trip, f.owner);
    assert.equal(result.pending, false);
    assert.deepEqual(result.candidates[0].photoIds, [mid]);
    assert.equal(calls, 0);
    run('UPDATE media SET lat=42 WHERE id=?', mid);
    assert.equal(queuedAreaSuggestions(f.trip, f.owner).candidates.length, 0);
    assert.throws(() => queuedAreaSuggestions(f.trip, f.follower));
  } finally {
    globalThis.fetch = original;
    run('DELETE FROM geo_jobs WHERE trip_id=?', f.trip);
  }
});

test('revoked member geographic jobs stop without contacting providers', async () => {
  const f = setup();
  queuedAreaSuggestions(f.trip, f.reader);
  run(
    'UPDATE members SET active=0 WHERE trip_id=? AND user_id=?',
    f.trip,
    f.reader,
  );
  await runGeoJob(new AbortController().signal);
  assert.equal(
    one(
      'SELECT 1 FROM geo_jobs WHERE trip_id=? AND user_id=?',
      f.trip,
      f.reader,
    ),
    undefined,
  );
});

test('provider cancellation leaves the queue immediately; interactive requests pass background work', async () => {
  const queue = new ProviderQueue(0);
  const order: string[] = [];
  let release!: () => void;
  const first = queue.request(async () => {
    await new Promise<void>((r) => (release = r));
    return 1;
  }, 1000);
  const low = queue.request(
    async () => {
      order.push('background');
      return 2;
    },
    1000,
    undefined,
    2,
  );
  const high = queue.request(async () => {
    order.push('interactive');
    return 3;
  }, 1000);
  const stop = new AbortController();
  const cancelled = queue.request(
    async () => {
      throw Error('Cancelled job ran');
    },
    1000,
    stop.signal,
  );
  const rejection = assert.rejects(cancelled);
  stop.abort();
  release();
  await Promise.all([first, low, high, rejection]);
  assert.deepEqual(order, ['interactive', 'background']);
});

test('provider deadlines include queue wait and JSON streams are bounded and cancelled', async () => {
  const queue = new ProviderQueue(0);
  const first = queue.request(async () => {
    await delay(50);
  }, 1000);
  let ran = false;
  const late = queue.request(async () => {
    ran = true;
  }, 10);
  const rejected = assert.rejects(late);
  await first;
  await rejected;
  assert.equal(ran, false);
  const response = new Response('x'.repeat(100));
  await assert.rejects(() =>
    boundedProviderJson(response, new AbortController().signal, 20),
  );
});

test('card and viewer previews reuse one upstream file and remain within their size limits', async () => {
  const f = setup();
  const mid = photo(f);
  const media = one(
    'SELECT m.*,? account_id FROM media m WHERE id=?',
    f.source,
    mid,
  )!;
  const bytes = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: 'red' },
  })
    .jpeg()
    .toBuffer();
  const original = globalThis.fetch;
  let downloads = 0;
  globalThis.fetch = async (input) =>
    String(input).includes('cloud-api.yandex.net')
      ? Response.json({
          preview: 'https://downloader.disk.yandex.net/disk/fixture',
        })
      : (downloads++,
        new Response(bytes, { headers: { 'content-type': 'image/jpeg' } }));
  try {
    const [card, viewer] = await Promise.all([
      serverPreview(media, undefined, false, 'card'),
      serverPreview(media, undefined, false, 'viewer'),
    ]);
    assert.equal(downloads, 1);
    assert.ok((await sharp(card.body).metadata()).width! <= 640);
    assert.ok((await sharp(viewer.body).metadata()).width! <= 1600);
  } finally {
    globalThis.fetch = original;
  }
});

test('video GPS accepts ISO6709, rejects invalid values and does not invent missing locations', () => {
  const probe = {
    streams: [],
    format: { duration: '1', tags: { location: '+41.1234+028.5678+000.000/' } },
  };
  assert.deepEqual(videoLocation(probe), { lat: 41.1234, lon: 28.5678 });
  probe.format.tags.location = '+99.1234+028.5678/';
  assert.equal(videoLocation(probe), null);
  assert.equal(videoLocation({ streams: [], format: { duration: '1' } }), null);
});

test('permanent Telegram failures terminate and can be explicitly retried; corrupt jobs do not jam delivery', async () => {
  const { deliverTelegram, retryTelegramDelivery } =
    await import('../lib/telegram');
  const previous = {
    token: process.env.TELEGRAM_BOT_TOKEN,
    admin: process.env.TELEGRAM_ADMIN_ID,
    enabled: process.env.TELEGRAM_ENABLED,
  };
  const original = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = 'fixture';
  process.env.TELEGRAM_ADMIN_ID = '123';
  process.env.TELEGRAM_ENABLED = 'true';
  const key = randomUUID();
  run(
    'INSERT INTO telegram_outbox(id,payload,available,created) VALUES (?,?,?,?)',
    key,
    encrypt(
      JSON.stringify({
        method: 'sendMessage',
        params: { chat_id: 123, text: 'Fixture' },
      }),
    ),
    0,
    Date.now(),
  );
  globalThis.fetch = async () =>
    Response.json({ ok: false, error_code: 403 }, { status: 403 });
  try {
    await deliverTelegram();
    assert.equal(
      one('SELECT terminal FROM telegram_outbox WHERE id=?', key)?.terminal,
      1,
    );
    assert.ok(retryTelegramDelivery(key));
    run('UPDATE telegram_outbox SET payload=? WHERE id=?', 'invalid', key);
    await deliverTelegram();
    assert.equal(
      one('SELECT last_error FROM telegram_outbox WHERE id=?', key)?.last_error,
      'payload_invalid',
    );
  } finally {
    globalThis.fetch = original;
    process.env.TELEGRAM_BOT_TOKEN = previous.token;
    process.env.TELEGRAM_ADMIN_ID = previous.admin;
    process.env.TELEGRAM_ENABLED = previous.enabled;
    run('DELETE FROM telegram_outbox WHERE id=?', key);
  }
});

test('refreshing one account is shared; caller cancellation and disconnection cannot lose or resurrect credentials', async () => {
  const { accountToken } = await import('../lib/yandex');
  const { decrypt } = await import('../lib/db');
  const original = globalThis.fetch;
  const f = setup();
  const expire = () =>
    run(
      'UPDATE accounts SET token=?,refresh=?,expires=? WHERE id=?',
      encrypt('old'),
      encrypt('refresh'),
      Date.now() - 1,
      f.source,
    );
  try {
    expire();
    let calls = 0;
    let release!: () => void;
    globalThis.fetch = async () => {
      calls++;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return Response.json({
        access_token: 'new',
        refresh_token: 'rotated',
        expires_in: 3600,
      });
    };
    const abort = new AbortController();
    const cancelled = accountToken(f.source, abort.signal);
    const rejection = assert.rejects(cancelled);
    const other = accountToken(f.source);
    abort.abort();
    await rejection;
    release();
    assert.equal(await other, 'new');
    assert.equal(calls, 1);
    assert.equal(
      decrypt(
        one('SELECT refresh FROM accounts WHERE id=?', f.source)!.refresh,
      ),
      'rotated',
    );
    expire();
    const disconnected = accountToken(f.source);
    const refused = assert.rejects(disconnected);
    run("UPDATE accounts SET disk_enabled=0,token='' WHERE id=?", f.source);
    release();
    await refused;
    assert.equal(
      one('SELECT token FROM accounts WHERE id=?', f.source)!.token,
      '',
    );
    assert.equal(one('SELECT count(*) n FROM account_refresh_locks')!.n, 0);
  } finally {
    globalThis.fetch = original;
  }
});
