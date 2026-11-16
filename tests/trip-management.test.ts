import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { session } from '../lib/access';
import { handle } from '../lib/api';
import { db, encrypt, one, run } from '../lib/db';
import { accessibleAreaPhotos } from '../lib/map-area-suggestions';
import { anniversaryMemories } from '../lib/memories';

const cookies = new Map<string, string>();

const firstDay = '2025-11-04';

const participationStart = '2025-11-06';

const participationEnd = '2025-11-08';

const lastDay = '2025-11-09';

function api(path: string, user = '', method = 'GET', input?: unknown) {
  const url = new URL('http://localhost:3000/api/' + path);
  return handle(
    new NextRequest(url, {
      method,
      headers: { origin: url.origin, cookie: cookies.get(user) ?? '' },
      body: input === undefined ? undefined : JSON.stringify(input),
    }),
    url.pathname.slice(5).split('/'),
  );
}

before(() => {
  for (const user of ['owner', 'manager', 'member', 'limited']) {
    run(
      'INSERT INTO users VALUES (?,?,?,?,?)',
      user,
      user + '@fixture.invalid',
      user,
      null,
      Date.now(),
    );
    cookies.set(user, 'ta_session=' + session(user));
  }
  run(
    'INSERT INTO trips(id,owner_id,title,destination,start,end,created) VALUES (?,?,?,?,?,?,?)',
    'trip',
    'owner',
    'Fixture',
    'Fixture',
    firstDay,
    lastDay,
    Date.now(),
  );
  for (const user of ['manager', 'member', 'limited'])
    run(
      'INSERT INTO members(trip_id,user_id,start,end,all_photos,can_manage) VALUES (?,?,?,?,?,?)',
      'trip',
      user,
      participationStart,
      participationEnd,
      Number(user === 'member'),
      Number(user === 'manager'),
    );
  for (const user of ['owner', 'member']) {
    run(
      'INSERT INTO accounts(id,user_id,yandex_id,label,token,disk_enabled) VALUES (?,?,?,?,?,1)',
      user,
      user,
      'fixture-yandex-' + user,
      'Fixture',
      encrypt('dummy'),
    );
    run(
      'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,1)',
      user,
      'trip',
      user,
      user,
      'disk:/fixture',
    );
  }
  for (const [mediaId, user, day] of [
    ['owner-first', 'owner', firstDay],
    ['member-first', 'member', firstDay],
    ['member-inside', 'member', participationStart],
  ]) {
    run(
      "INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis,lat,lon) VALUES (?,?,?,?,?,?,?,'image/jpeg','photo',?,'created',41,29)",
      mediaId,
      user,
      'trip',
      user,
      mediaId,
      'disk:/fixture/' + mediaId,
      mediaId,
      day + 'T12:00:00',
    );
    run('INSERT INTO media_favorites VALUES (?,?)', 'owner', mediaId);
  }
});

after(() => db.close());

test('trip list, covers, memories and gallery use the same full-trip window for managers', async () => {
  for (const [user, count, memoryCount] of [
    ['owner', 3, 2],
    ['manager', 3, 2],
    ['member', 3, 2],
    ['limited', 1, 0],
  ] as const) {
    const archive = await (await api('trips', user)).json();
    const trip = await (await api('trips/trip', user)).json();
    assert.equal(archive.trips[0].media_count, count);
    assert.equal(archive.trips[0].covers.length, count);
    assert.equal(trip.media.length, count);
    assert.equal(anniversaryMemories(user, '2026-11-04').length, memoryCount);
  }
});

test('managers get an eligible invite list and share the same guest link as the owner', async () => {
  const invitees = await (
    await api('trips/trip/invitees?q=owner%40fixture.invalid', 'manager')
  ).json();
  assert.deepEqual(invitees.users, []);
  const share = 'trips/trip/share';
  const ensureLink = { enabled: true, rotate: false };
  const initial = await api(share, 'manager', 'POST', ensureLink);
  assert.equal(initial.status, 200);
  const { url } = await initial.json();
  for (const user of ['owner', 'manager'])
    assert.deepEqual(
      await (await api(share, user, 'POST', ensureLink)).json(),
      {
        url,
      },
    );
  assert.equal((await api(share, 'member', 'GET')).status, 403);
  const guest = await api('share/' + url.split('/s/')[1]);
  assert.equal(guest.status, 200);
  assert.equal((await guest.json()).trip.role, 'guest');
  const replaced = await (
    await api(share, 'manager', 'POST', { enabled: true, rotate: true })
  ).json();
  assert.notEqual(replaced.url, url);
  assert.equal(
    (await api(share, 'manager', 'POST', { enabled: false })).status,
    200,
  );
  assert.deepEqual(await (await api(share, 'owner')).json(), { url: null });
});

test('a manager moderates shared places while contributing authors use their actual days', async () => {
  assert.deepEqual(
    accessibleAreaPhotos('trip', 'manager')
      .photos.map((photo) => photo.id)
      .sort(),
    ['member-first', 'member-inside', 'owner-first'],
  );
  assert.deepEqual(
    accessibleAreaPhotos('trip', 'member').photos.map((photo) => photo.id),
    ['member-inside'],
  );
  for (const [mediaId, placeId] of [
    ['owner-first', 'one'],
    ['member-first', 'two'],
  ])
    run(
      'INSERT INTO confirmed_places(id,trip_id,media_id,title,summary,url,lat,lon,day) VALUES (?,?,?,?,?,?,?,?,?)',
      placeId,
      'trip',
      mediaId,
      'Museum',
      'Fixture',
      'https://ru.wikipedia.org/?curid=123',
      41,
      29,
      firstDay,
    );
  assert.equal(
    (await api('media/owner-first/places/one', 'manager', 'DELETE')).status,
    200,
  );
  assert.equal(
    (await api('trips/trip/places/123', 'manager', 'DELETE')).status,
    200,
  );
  assert.equal(one('SELECT count(*) n FROM confirmed_places')?.n, 0);
  assert.equal(
    (await api('media/owner-first', 'manager', 'DELETE')).status,
    403,
  );
  assert.equal(
    (await api('media/member-first', 'member', 'DELETE')).status,
    403,
  );
  assert.equal(
    (await api('media/member-first', 'member', 'PATCH', { rotation: 90 }))
      .status,
    403,
  );
  assert.equal(
    (
      await api('media/member-first', 'member', 'PATCH', {
        hiddenFromGuests: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (await api('media/member-inside', 'member', 'PATCH', { hidden: true }))
      .status,
    200,
  );
  assert.equal(
    (
      await api('media/member-inside', 'member', 'PATCH', {
        title: 'Renamed',
        rotation: 90,
      })
    ).status,
    404,
  );
  assert.equal(
    one("SELECT rotation FROM media WHERE id='member-inside'")?.rotation,
    0,
  );
  assert.equal(
    (await api('media/member-inside', 'member', 'PATCH', { rotation: 90 }))
      .status,
    200,
  );
});
