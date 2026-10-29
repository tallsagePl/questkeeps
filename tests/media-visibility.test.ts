import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';

process.env.DATABASE_PATH = './data/visibility-' + randomUUID() + '.sqlite';

process.env.APP_URL = 'http://localhost:3000';

process.env.TOKEN_ENCRYPTION_KEY = '34'.repeat(32);

const { db, run, hash, encrypt } = await import('../lib/db');

const { handle } = await import('../lib/api');

const { session, mediaFor } = await import('../lib/access');

after(() => db.close());

test('guest-only hiding protects listings, places and direct files while participants keep their access', async () => {
  for (const user of ['owner', 'author', 'member', 'outsider'])
    run(
      'INSERT INTO users VALUES (?,?,?,?,?)',
      user,
      user + '@fixture.invalid',
      user,
      null,
      Date.now(),
    );
  run(
    'INSERT INTO trips(id,owner_id,title,destination,start,end,share_hash,created) VALUES (?,?,?,?,?,?,?,?)',
    'trip',
    'owner',
    'Fixture',
    'Fixture',
    '2026-10-10',
    '2026-10-18',
    hash('fixture-share'),
    Date.now(),
  );
  for (const user of ['author', 'member'])
    run(
      'INSERT INTO members(trip_id,user_id,start,end,active) VALUES (?,?,?,?,1)',
      'trip',
      user,
      '2026-10-10',
      '2026-10-18',
    );
  run(
    'INSERT INTO accounts(id,user_id,yandex_id,label,token,disk_enabled) VALUES (?,?,?,?,?,1)',
    'account',
    'author',
    'fixture-yandex',
    'Fixture',
    encrypt('dummy'),
  );
  run(
    'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,1)',
    'source',
    'trip',
    'author',
    'account',
    'disk:/fixture',
  );
  run(
    'INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis,lat,lon) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    'photo',
    'source',
    'trip',
    'author',
    'resource',
    'disk:/fixture/a.jpg',
    'a.jpg',
    'image/jpeg',
    'photo',
    '2026-10-13T12:00:00',
    'manual',
    41,
    29,
  );
  run(
    'INSERT INTO confirmed_places(id,trip_id,media_id,title,summary,url,lat,lon,day) VALUES (?,?,?,?,?,?,?,?,?)',
    'place',
    'trip',
    'photo',
    'Museum',
    'Fixture',
    'https://ru.wikipedia.org/?curid=123',
    41,
    29,
    '2026-10-13',
  );
  const cookies = Object.fromEntries(
    ['owner', 'author', 'member', 'outsider'].map((id) => [
      id,
      'ta_session=' + session(id),
    ]),
  );
  const request = (path: string, cookie = '', method = 'GET', data?: unknown) =>
    new NextRequest('http://localhost:3000/api/' + path, {
      method,
      headers: { cookie, origin: 'http://localhost:3000' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  const api = (path: string, cookie = '', method = 'GET', data?: unknown) =>
    handle(request(path, cookie, method, data), path.split('?')[0].split('/'));
  assert.equal(
    (await (await api('share/fixture-share')).json()).media.length,
    1,
  );
  assert.equal(
    (
      await api('media/photo', cookies.member, 'PATCH', {
        hiddenFromGuests: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api('media/photo', cookies.author, 'PATCH', {
        hiddenFromGuests: true,
      })
    ).status,
    200,
  );
  for (const user of ['owner', 'author', 'member']) {
    const data = await (await api('trips/trip', cookies[user])).json();
    assert.equal(data.media.length, 1);
    assert.equal(data.media[0].hidden_from_guests, 1);
    assert.equal(data.places.length, 1);
    assert.equal(
      mediaFor(request('media/photo/preview', cookies[user]), 'photo').id,
      'photo',
    );
  }
  for (const cookie of ['', cookies.author, cookies.member]) {
    const data = await (await api('share/fixture-share', cookie)).json();
    assert.equal(data.media.length, 0);
    assert.equal(data.places.length, 0);
    for (const resource of [
      'preview',
      'original',
      'download',
      'places/place/image',
      'places/place/text',
      'places/place/geometry',
    ])
      assert.equal(
        (await api('media/photo/' + resource + '?share=fixture-share', cookie))
          .status,
        404,
      );
  }
  assert.equal(
    (await api('media/photo/preview', cookies.outsider)).status,
    403,
  );
  run("UPDATE members SET start='2026-10-14' WHERE user_id='member'");
  assert.equal(
    (await (await api('trips/trip', cookies.member)).json()).media.length,
    0,
  );
  assert.equal((await api('media/photo/preview', cookies.member)).status, 403);
  assert.equal(
    (await api('media/photo', cookies.author, 'PATCH', { hidden: true }))
      .status,
    200,
  );
  assert.equal(
    (await (await api('trips/trip', cookies.owner)).json()).media.length,
    0,
  );
  assert.equal(
    (await (await api('trips/trip', cookies.author)).json()).media.length,
    1,
  );
  assert.equal((await api('media/photo/preview', cookies.author)).status, 404);
  const own = await (await api('my-media?trip=trip', cookies.author)).json();
  assert.equal(own.media[0].hidden_from_guests, 1);
  assert.equal(
    (
      await api('media/photo', cookies.author, 'PATCH', {
        hidden: false,
        hiddenFromGuests: false,
      })
    ).status,
    200,
  );
  assert.equal(
    (await (await api('share/fixture-share')).json()).media.length,
    1,
  );
  assert.equal(
    (await (await api('share/fixture-share')).json()).places.length,
    1,
  );
  assert.equal(db.pragma('user_version', { simple: true }), 11);
});
