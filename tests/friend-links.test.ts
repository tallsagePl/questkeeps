import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { db, run, one, hash, id } from '../lib/db';
import { session } from '../lib/access';
import { handle } from '../lib/api';
import {
  createFriendLink,
  acceptFriendLink,
  revokeFriendLink,
} from '../lib/friend-links';
import { relationship } from '../lib/friends';
import { GET, HEAD } from '../app/friend/[token]/route';
const users = [id(), id(), id()];
for (const user of users)
  run(
    'INSERT INTO users VALUES (?,?,?,?,?)',
    user,
    user + '@fixture.invalid',
    'Friend fixture',
    null,
    Date.now(),
  );
const [owner, guest, other] = users;
const cookies = users.map((user) => 'ta_session=' + session(user));
after(() => db.close());
async function api(
  path: string,
  method = 'GET',
  cookie = '',
  origin = 'http://localhost:3000',
) {
  return handle(
    new NextRequest('http://localhost:3000/api/' + path, {
      method,
      headers: { cookie, origin },
    }),
    path.split('/'),
  );
}
test('friend links are private hashed capabilities; rotation, expiry and revocation take effect immediately', () => {
  const first = createFriendLink(owner);
  assert.equal(first.token.length, 43);
  assert.equal(
    one('SELECT hash FROM friend_links WHERE user_id=?', owner)?.hash,
    hash(first.token),
  );
  assert.throws(() => acceptFriendLink(owner, first.token), /твоя ссылка/);
  const next = createFriendLink(owner);
  assert.throws(() => acceptFriendLink(guest, first.token), /недействительна/);
  assert.equal(acceptFriendLink(guest, next.token).accepted, true);
  assert.equal(relationship(guest, owner), 'friends');
  assert.equal(acceptFriendLink(guest, next.token).accepted, true);
  assert.equal(acceptFriendLink(other, next.token).accepted, true);
  run(
    'UPDATE friend_links SET expires=? WHERE user_id=?',
    Date.now() - 1,
    owner,
  );
  assert.throws(() => acceptFriendLink(guest, next.token), /истекла/);
  const revoked = createFriendLink(owner);
  revokeFriendLink(owner);
  assert.throws(
    () => acceptFriendLink(guest, revoked.token),
    /недействительна/,
  );
  assert.equal(relationship(guest, owner), 'friends');
});
test('GET and HEAD do not add friends; a pending cookie survives anonymous access and is consumed only by authenticated same-origin POST', async () => {
  run('DELETE FROM friendships');
  assert.equal((await api('friends/link', 'POST')).status, 401);
  const generated = await api('friends/link', 'POST', cookies[0]);
  assert.equal(generated.status, 200);
  const { url } = await generated.json();
  const token = new URL(url).pathname.split('/').at(-1)!;
  const landing = await GET(new NextRequest(url), {
    params: Promise.resolve({ token }),
  });
  assert.equal(relationship(owner, guest), 'none');
  assert.equal(
    new URL(landing.headers.get('location')!).origin,
    new URL(process.env.APP_URL!).origin,
  );
  const pending = landing.headers.get('set-cookie')!;
  assert.match(pending, /HttpOnly/);
  assert.match(pending, /SameSite=lax/i);
  assert.match(pending, /Path=\//);
  assert.equal((await HEAD()).headers.get('set-cookie'), null);
  const saved = pending.split(';')[0];
  const anon = await api('friends/link/accept', 'POST', saved);
  assert.equal(anon.status, 401);
  assert.equal(anon.headers.get('set-cookie'), null);
  const cross = await api(
    'friends/link/accept',
    'POST',
    cookies[1] + '; ' + saved,
    'https://other.invalid',
  );
  assert.equal(cross.status, 403);
  const accepted = await api(
    'friends/link/accept',
    'POST',
    cookies[1] + '; ' + saved,
  );
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).accepted, true);
  assert.match(accepted.headers.get('set-cookie')!, /Max-Age=0/);
  assert.equal(relationship(owner, guest), 'friends');
  assert.deepEqual(
    await (await api('friends/link/accept', 'POST', cookies[1])).json(),
    { accepted: false },
  );
  const revoked = await api('friends/link', 'DELETE', cookies[0]);
  assert.equal(revoked.status, 200);
  const invalid = await api(
    'friends/link/accept',
    'POST',
    cookies[2] + '; ' + saved,
  );
  assert.equal(invalid.status, 404);
  assert.match(invalid.headers.get('set-cookie')!, /Max-Age=0/);
  assert.equal(relationship(owner, other), 'none');
  const malformed = await GET(
    new NextRequest('http://localhost:3000/friend/bad'),
    { params: Promise.resolve({ token: 'bad' }) },
  );
  assert.match(malformed.headers.get('set-cookie')!, /Max-Age=0/);
  assert.match(malformed.headers.get('location')!, /friend=invalid/);
});
