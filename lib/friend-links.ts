import { db, one, run, hash, token } from './db';
import { fail } from './access';
import { ensureUsername } from './profiles';

export const pendingFriendCookie = 'qk_friend_invite';

export const validFriendToken = (value: string) =>
  /^[A-Za-z0-9_-]{43}$/.test(value);

export function friendLinkStatus(userId: string) {
  return {
    expires:
      one(
        'SELECT expires FROM friend_links WHERE user_id=? AND expires>?',
        userId,
        Date.now(),
      )?.expires ?? null,
  };
}

export function createFriendLink(userId: string) {
  const value = token();
  const expires = Date.now() + 30 * 86400000;
  run(
    'INSERT INTO friend_links(user_id,hash,expires) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET hash=excluded.hash,expires=excluded.expires',
    userId,
    hash(value),
    expires,
  );
  return { token: value, expires };
}

export function revokeFriendLink(userId: string) {
  run('DELETE FROM friend_links WHERE user_id=?', userId);
}

export function acceptFriendLink(userId: string, value: string) {
  if (!validFriendToken(value))
    fail(404, 'friends.thisLinkIsInvalidOrHasExpired');
  return db
    .transaction(() => {
      const inviter = one(
        'SELECT u.id,u.name FROM friend_links l JOIN users u ON u.id=l.user_id WHERE l.hash=? AND l.expires>?',
        hash(value),
        Date.now(),
      );
      if (!inviter) fail(404, 'friends.thisLinkIsInvalidOrHasExpired');
      if (inviter.id === userId)
        fail(400, 'messages.thisIsYourOwnFriendInvitationLink');
      ensureUsername(userId);
      ensureUsername(inviter.id);
      const [a, b] =
        userId < inviter.id ? [userId, inviter.id] : [inviter.id, userId];
      run(
        "INSERT INTO friendships(user_a,user_b,requested_by,status,created) VALUES (?,?,?,'accepted',?) ON CONFLICT(user_a,user_b) DO UPDATE SET status='accepted'",
        a,
        b,
        inviter.id,
        Date.now(),
      );
      return { accepted: true, name: inviter.name, userId: inviter.id };
    })
    .immediate();
}
