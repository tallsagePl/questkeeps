import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, run, encrypt } from '../lib/db';
import { tripCovers } from '../lib/trip-covers';

after(() => db.close());

test('favorite covers respect guest visibility, membership dates and source approval', () => {
  for (const user of ['owner', 'member', 'stranger'])
    run(
      'INSERT INTO users VALUES (?,?,?,?,?)',
      user,
      user + '@fixture.invalid',
      user,
      null,
      Date.now(),
    );
  run(
    'INSERT INTO trips(id,owner_id,title,destination,start,end,created) VALUES (?,?,?,?,?,?,?)',
    'trip',
    'owner',
    'Trip',
    'City',
    '2026-10-10',
    '2026-10-18',
    Date.now(),
  );
  run(
    'INSERT INTO members(trip_id,user_id,start,end) VALUES (?,?,?,?)',
    'trip',
    'member',
    '2026-10-12',
    '2026-10-13',
  );
  run(
    'INSERT INTO accounts(id,user_id,yandex_id,label,token) VALUES (?,?,?,?,?)',
    'account',
    'owner',
    'yandex',
    'Fixture',
    encrypt('dummy'),
  );
  run(
    'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,1)',
    'source',
    'trip',
    'owner',
    'account',
    'disk:/fixture',
  );
  for (const [id, day] of [
    ['public', '2026-10-12'],
    ['private', '2026-10-12'],
    ['hidden', '2026-10-12'],
    ['missing', '2026-10-12'],
    ['outside-member', '2026-10-15'],
    ['outside-trip', '2026-10-20'],
    ['ordinary', '2026-10-12'],
    ['video', '2026-10-12'],
  ]) {
    run(
      "INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,revision,rotation,hidden,hidden_from_guests,missing,date_basis) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'created')",
      id,
      'source',
      'trip',
      'owner',
      id,
      'disk:/' + id,
      id,
      'image/jpeg',
      id === 'video' ? 'video' : 'photo',
      day,
      'revision',
      90,
      Number(id === 'hidden'),
      Number(id === 'private'),
      Number(id === 'missing'),
    );
    if (id !== 'ordinary')
      for (const user of ['owner', 'member', 'stranger'])
        run('INSERT INTO media_favorites VALUES (?,?)', user, id);
  }
  assert.deepEqual(
    tripCovers('trip', 'member').map((x) => x.id),
    ['private', 'public'],
  );
  assert.deepEqual(tripCovers('trip', 'stranger'), []);
  const guest = tripCovers('trip', 'owner', 'guest-token');
  assert.deepEqual(
    guest.map((x) => x.id),
    ['public', 'outside-member'],
  );
  assert.equal(guest[0].rotation, 90);
  assert.equal(
    new URL(guest[0].src, 'https://fixture.invalid').searchParams.get('share'),
    'guest-token',
  );
  assert.deepEqual(
    tripCovers('trip', 'owner').map((x) => x.id),
    ['private', 'public', 'outside-member'],
  );
  run('UPDATE sources SET approved=0 WHERE id=?', 'source');
  assert.deepEqual(tripCovers('trip', 'owner'), []);
});
