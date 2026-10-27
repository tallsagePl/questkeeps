import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { db, run, one, id, encrypt } from '../lib/db';
import { handle } from '../lib/api';
import { session, mediaFor } from '../lib/access';
import { ensureUsername } from '../lib/profiles';

after(() => db.close());

async function request(
  path: string,
  cookie = '',
  data?: unknown,
  method = data ? 'POST' : 'GET',
  origin = 'http://localhost:3000',
) {
  return handle(
    new NextRequest('http://localhost:3000/api/' + path, {
      method,
      headers: { cookie, origin, 'content-type': 'application/json' },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }),
    path.split('?')[0].split('/'),
  );
}

function fixture() {
  const owner = id();
  const person = id();
  const other = id();
  const trip = id();
  for (const user of [owner, person, other]) {
    run(
      'INSERT INTO users VALUES(?,?,?,?,?)',
      user,
      user + '@fixture.invalid',
      'Traveler ' + user,
      null,
      Date.now(),
    );
    ensureUsername(user);
  }
  run(
    'INSERT INTO trips(id,owner_id,title,destination,start,end,created) VALUES(?,?,?,?,?,?,?)',
    trip,
    owner,
    'Invitation story',
    'Istanbul',
    '2026-10-10',
    '2026-10-18',
    Date.now(),
  );
  const account = id();
  const source = id();
  run(
    'INSERT INTO accounts(id,user_id,yandex_id,label,token,disk_enabled) VALUES(?,?,?,?,?,1)',
    account,
    owner,
    id(),
    'Drive',
    encrypt('fixture'),
  );
  run(
    'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES(?,?,?,?,?,1)',
    source,
    trip,
    owner,
    account,
    'disk:/fixture',
  );
  const photos = ['2026-10-10', '2026-10-13', '2026-10-18'].map(
    (day, index) => {
      const photo = id();
      run(
        'INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis,hidden,hidden_from_guests) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        photo,
        source,
        trip,
        owner,
        photo,
        'disk:/' + photo,
        'photo.jpg',
        'image/jpeg',
        'photo',
        day + 'T12:00:00',
        'exif',
        index === 2 ? 1 : 0,
        1,
      );
      return photo;
    },
  );
  return {
    owner,
    person,
    other,
    trip,
    photos,
    ownerCookie: 'ta_session=' + session(owner),
    personCookie: 'ta_session=' + session(person),
    otherCookie: 'ta_session=' + session(other),
  };
}

const dates = { start: '2026-10-12', end: '2026-10-14' };

test('invitation dates are required and bounded; link grants include visibility and remain single use', async () => {
  const f = fixture();
  for (const data of [
    { allPhotos: true },
    { ...dates, start: '2026-10-15' },
    { ...dates, end: '2026-10-19' },
    { ...dates, allPhotos: 'true' },
  ])
    assert.equal(
      (await request('trips/' + f.trip + '/invite', f.ownerCookie, data))
        .status,
      400,
    );
  assert.equal(
    (await request('trips/' + f.trip + '/invite', f.personCookie, dates))
      .status,
    403,
  );
  const created = await request('trips/' + f.trip + '/invite', f.ownerCookie, {
    ...dates,
    allPhotos: true,
  });
  const token = (await created.json()).url.split('/').at(-1);
  assert.equal(
    (await (await request('invites/' + token)).json()).allPhotos,
    true,
  );
  assert.equal(
    (await request('invites/' + token, f.personCookie, {})).status,
    200,
  );
  assert.equal(
    (await request('invites/' + token, f.otherCookie, {})).status,
    404,
  );
  assert.equal(
    one(
      'SELECT all_photos FROM members WHERE trip_id=? AND user_id=?',
      f.trip,
      f.person,
    )!.all_photos,
    1,
  );
});

test('direct invitations are private, consent-based, recipient-bound and cannot be duplicated or forged', async () => {
  const f = fixture();
  const path = 'trips/' + f.trip + '/invite';
  assert.equal(
    (await request(path, f.ownerCookie, { ...dates, recipientId: f.person }))
      .status,
    200,
  );
  assert.equal((await request('trips/' + f.trip, f.personCookie)).status, 403);
  const inbox = await (await request('invitations', f.personCookie)).json();
  assert.equal(inbox.count, 1);
  const invite = inbox.invitations[0];
  assert.equal(
    (await (await request('invitations', f.otherCookie)).json()).count,
    0,
  );
  assert.equal((await request('invitations')).status, 401);
  assert.equal(
    (await request(path, f.ownerCookie, { ...dates, recipientId: f.person }))
      .status,
    409,
  );
  assert.equal(
    (
      await request('invitations/' + invite.id, f.otherCookie, {
        action: 'accept',
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request('invitations/' + invite.id, f.personCookie, {
        action: 'accept',
        allPhotos: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        'invitations/' + invite.id,
        f.personCookie,
        { action: 'accept' },
        'POST',
        'https://foreign.invalid',
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request('invitations/' + invite.id, f.personCookie, {
        action: 'accept',
      })
    ).status,
    200,
  );
  assert.equal(
    (await (await request('invitations', f.personCookie)).json()).count,
    0,
  );
  const view = await (await request('trips/' + f.trip, f.personCookie)).json();
  assert.deepEqual(
    view.media.map((m: { id: string }) => m.id),
    [f.photos[1]],
  );
  assert.equal(
    (
      await request('invitations/' + invite.id, f.personCookie, {
        action: 'accept',
      })
    ).status,
    404,
  );
});

test('view-all expands readable dates while preserving participation, hidden photos and owner controls', async () => {
  const f = fixture();
  await request('trips/' + f.trip + '/invite', f.ownerCookie, {
    ...dates,
    recipientId: f.person,
    allPhotos: true,
  });
  const invite = (await (await request('invitations', f.personCookie)).json())
    .invitations[0];
  await request('invitations/' + invite.id, f.personCookie, {
    action: 'accept',
  });
  const view = await (await request('trips/' + f.trip, f.personCookie)).json();
  assert.equal(view.trip.from, '2026-10-10');
  assert.equal(view.trip.participationStart, dates.start);
  assert.equal(view.trip.participationEnd, dates.end);
  assert.deepEqual(
    view.media.map((m: { id: string }) => m.id),
    f.photos.slice(0, 2),
  );
  assert.equal(
    mediaFor(
      new Request('http://localhost:3000', {
        headers: { cookie: f.personCookie },
      }),
      f.photos[0],
    ).id,
    f.photos[0],
  );
  assert.throws(() =>
    mediaFor(
      new Request('http://localhost:3000', {
        headers: { cookie: f.personCookie },
      }),
      f.photos[2],
    ),
  );
  assert.equal(
    (
      await request('trips/' + f.trip + '/notes', f.personCookie, {
        day: '2026-10-10',
        text: 'Outside participation',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        'trips/' + f.trip + '/members',
        f.personCookie,
        { userId: f.person, allPhotos: true },
        'PATCH',
      )
    ).status,
    403,
  );
  await request(
    'trips/' + f.trip + '/members',
    f.ownerCookie,
    { userId: f.person, allPhotos: false },
    'PATCH',
  );
  assert.equal(
    (await (await request('trips/' + f.trip, f.personCookie)).json()).media
      .length,
    1,
  );
  assert.throws(() =>
    mediaFor(
      new Request('http://localhost:3000', {
        headers: { cookie: f.personCookie },
      }),
      f.photos[0],
    ),
  );
  await request(
    'trips/' + f.trip + '/members',
    f.ownerCookie,
    { userId: f.person, active: false },
    'PATCH',
  );
  assert.equal((await request('trips/' + f.trip, f.personCookie)).status, 403);
});

test('search uses nickname and exact email, never exposes email, and requires ownership', async () => {
  const f = fixture();
  const username = ensureUsername(f.person);
  for (const query of [
    '@' + username,
    (f.person + '@fixture.invalid').toUpperCase(),
  ]) {
    const response = await request(
      'trips/' + f.trip + '/invitees?q=' + encodeURIComponent(query),
      f.ownerCookie,
    );
    assert.equal(response.status, 200);
    const found = (await response.json()).users;
    assert.equal(found.length, 1);
    assert.equal(found[0].id, f.person);
    assert.equal('email' in found[0], false);
  }
  assert.equal(
    (
      await (
        await request(
          'trips/' + f.trip + '/invitees?q=fixture.invalid',
          f.ownerCookie,
        )
      ).json()
    ).users.length,
    0,
  );
  assert.equal(
    (
      await request(
        'trips/' + f.trip + '/invitees?q=' + username,
        f.personCookie,
      )
    ).status,
    403,
  );
});

test('decline and expiry do not create membership; an expired invitation can be reissued', async () => {
  const f = fixture();
  const path = 'trips/' + f.trip + '/invite';
  await request(path, f.ownerCookie, { ...dates, recipientId: f.person });
  let invite = (await (await request('invitations', f.personCookie)).json())
    .invitations[0];
  await request('invitations/' + invite.id, f.personCookie, {
    action: 'decline',
  });
  assert.equal(
    one(
      'SELECT 1 FROM members WHERE trip_id=? AND user_id=?',
      f.trip,
      f.person,
    ),
    undefined,
  );
  await request(path, f.ownerCookie, { ...dates, recipientId: f.person });
  invite = (await (await request('invitations', f.personCookie)).json())
    .invitations[0];
  run('UPDATE trip_invitations SET expires=0 WHERE id=?', invite.id);
  assert.equal(
    (await (await request('invitations', f.personCookie)).json()).count,
    0,
  );
  assert.equal(
    (
      await request('invitations/' + invite.id, f.personCookie, {
        action: 'accept',
      })
    ).status,
    404,
  );
  assert.equal(
    (await request(path, f.ownerCookie, { ...dates, recipientId: f.person }))
      .status,
    200,
  );
});

test('notification snapshots are private and Drive checks are queued once per authenticated session', async () => {
  const f = fixture();
  const source = one('SELECT id FROM sources WHERE trip_id=?', f.trip)!.id;
  run('UPDATE sources SET last_sync=? WHERE id=?', 100, source);
  assert.equal(
    (await request('invitations/check-drive', '', {}, 'POST')).status,
    401,
  );
  assert.equal(
    (
      await request(
        'invitations/check-drive',
        f.ownerCookie,
        {},
        'POST',
        'https://other.invalid',
      )
    ).status,
    403,
  );
  let snapshot = await (await request('invitations', f.ownerCookie)).json();
  assert.equal(snapshot.drive.find((trip: any) => trip.id === f.trip).count, 3);
  assert.match(
    snapshot.drive.find((trip: any) => trip.id === f.trip).stamp,
    /^[a-f0-9]{64}$/,
  );
  const other = await (await request('invitations', f.otherCookie)).json();
  assert.deepEqual(other.drive, []);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw Error('A queued Drive check must not fetch Yandex in the request');
  }) as typeof fetch;
  try {
    assert.equal(
      (
        await (
          await request('invitations/check-drive', f.ownerCookie, {}, 'POST')
        ).json()
      ).queued,
      1,
    );
    assert.equal(
      one('SELECT last_sync FROM sources WHERE id=?', source)!.last_sync,
      null,
    );
    run('UPDATE sources SET last_sync=? WHERE id=?', 200, source);
    assert.equal(
      (
        await (
          await request('invitations/check-drive', f.ownerCookie, {}, 'POST')
        ).json()
      ).queued,
      0,
    );
    assert.equal(
      one('SELECT last_sync FROM sources WHERE id=?', source)!.last_sync,
      200,
    );
    assert.equal(
      (
        await (
          await request('invitations/check-drive', f.otherCookie, {}, 'POST')
        ).json()
      ).queued,
      0,
    );
    assert.equal(
      one('SELECT last_sync FROM sources WHERE id=?', source)!.last_sync,
      200,
    );
    const newSession = 'ta_session=' + session(f.owner);
    assert.equal(
      (
        await (
          await request('invitations/check-drive', newSession, {}, 'POST')
        ).json()
      ).queued,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  await request('friends/' + f.owner, f.personCookie, {}, 'POST');
  snapshot = await (await request('invitations', f.ownerCookie)).json();
  assert.equal(
    snapshot.friends.incoming.some((person: any) => person.id === f.person),
    true,
  );
  assert.equal(
    JSON.stringify(snapshot.friends).includes('@fixture.invalid'),
    false,
  );
});

test('new media and accepted friendship notifications survive sessions and are acknowledged only by their owner', async () => {
  const f = fixture();
  await request('invitations', f.ownerCookie);
  const source = one('SELECT id FROM sources WHERE trip_id=?', f.trip)!.id;
  const photo = id();
  run(
    'INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    photo,
    source,
    f.trip,
    f.owner,
    photo,
    'disk:/new.jpg',
    'new.jpg',
    'image/jpeg',
    'photo',
    '2026-10-13',
    'created',
  );
  let data = await (await request('invitations', f.ownerCookie)).json();
  assert.equal(data.driveChanges.length, 1);
  const key = 'drive:' + f.trip + ':' + data.driveChanges[0].stamp;
  assert.equal(
    (await request('invitations/read', f.ownerCookie, { keys: [key] })).status,
    200,
  );
  const anotherSession = 'ta_session=' + session(f.owner);
  data = await (await request('invitations', anotherSession)).json();
  assert.equal(data.driveChanges.length, 1);
  assert.ok(data.seen.includes(key));
  await request('invitations/drive-read', f.otherCookie, { tripId: f.trip });
  assert.equal(
    (await (await request('invitations', anotherSession)).json()).driveChanges
      .length,
    1,
  );
  await request('invitations/drive-read', anotherSession, { tripId: f.trip });
  assert.equal(
    (await (await request('invitations', f.ownerCookie)).json()).driveChanges
      .length,
    0,
  );
  await request('friends/' + f.owner, f.personCookie, {});
  await request(
    'friends/' + f.person,
    f.ownerCookie,
    { action: 'accept' },
    'PATCH',
  );
  const personSession = 'ta_session=' + session(f.person);
  data = await (await request('invitations', personSession)).json();
  assert.equal(
    data.accepted.some((p: any) => p.id === f.owner),
    true,
  );
  assert.equal(
    (await (await request('invitations', f.otherCookie)).json()).accepted
      .length,
    0,
  );
});
