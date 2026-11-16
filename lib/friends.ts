import { all, one, run, db } from './db';
import { fail } from './access';
import { ensureUsername } from './profiles';
import { guestToken } from './guest-links';

export type Relationship =
  'self' | 'none' | 'incoming' | 'outgoing' | 'friends';

function pair(a: string, b: string) {
  return a < b ? [a, b] : [b, a];
}

function targetUser(userId: string, targetId: string) {
  if (userId === targetId) fail(400, 'messages.youCannotAddYourselfAsAFriend');
  if (!one('SELECT 1 FROM users WHERE id=?', targetId))
    fail(404, 'tripDescription.userNotFound');
}

export function relationship(userId: string, targetId: string): Relationship {
  if (userId === targetId) return 'self';
  const [a, b] = pair(userId, targetId);
  const row = one(
    'SELECT status,requested_by FROM friendships WHERE user_a=? AND user_b=?',
    a,
    b,
  );
  return !row
    ? 'none'
    : row.status === 'accepted'
      ? 'friends'
      : row.requested_by === userId
        ? 'outgoing'
        : 'incoming';
}

export function friendLists(userId: string) {
  const rows = all(
    'SELECT u.id,u.name,h.username,EXISTS(SELECT 1 FROM user_avatars av WHERE av.user_id=u.id) OR EXISTS(SELECT 1 FROM accounts ac WHERE ac.user_id=u.id AND ac.disk_enabled=1) hasAvatar,f.status,f.requested_by FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_a=? THEN f.user_b ELSE f.user_a END JOIN user_handles h ON h.user_id=u.id WHERE f.user_a=? OR f.user_b=? ORDER BY quest_fold(u.name),u.id',
    userId,
    userId,
    userId,
  );
  const profile = (u: Record<string, any>) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    hasAvatar: !!u.hasAvatar,
  });
  return {
    friends: rows.filter((u) => u.status === 'accepted').map(profile),
    incoming: rows
      .filter((u) => u.status === 'pending' && u.requested_by !== userId)
      .map(profile),
    outgoing: rows
      .filter((u) => u.status === 'pending' && u.requested_by === userId)
      .map(profile),
  };
}

export type FriendTrip = {
  title: string;
  destination: string;
  url: string;
};

export function latestFriendTrips(userId: string): Record<string, FriendTrip> {
  const trips = all<{
    id: string;
    owner_id: string;
    title: string;
    destination: string;
    share_hash: string | null;
    member: number;
  }>(
    `WITH accepted_friends AS (
       SELECT CASE WHEN user_a=? THEN user_b ELSE user_a END id
       FROM friendships WHERE (user_a=? OR user_b=?) AND status='accepted'
     ), accessible AS (
       SELECT t.id,t.owner_id,t.title,t.destination,t.share_hash,mb.active IS NOT NULL AS member,
         ROW_NUMBER() OVER (PARTITION BY t.owner_id ORDER BY t.end DESC,t.start DESC,t.created DESC,t.id) AS rank
       FROM accepted_friends a JOIN trips t ON t.owner_id=a.id
       LEFT JOIN members mb ON mb.trip_id=t.id AND mb.user_id=? AND mb.active=1
       LEFT JOIN trip_follows f ON f.trip_id=t.id AND f.user_id=? AND f.share_hash=t.share_hash
       WHERE mb.user_id IS NOT NULL OR f.user_id IS NOT NULL
     )
     SELECT id,owner_id,title,destination,share_hash,member FROM accessible WHERE rank=1`,
    userId,
    userId,
    userId,
    userId,
    userId,
  );
  return Object.fromEntries(
    trips.map((trip) => [
      trip.owner_id,
      {
        title: trip.title,
        destination: trip.destination,
        url: trip.member
          ? '/?trip=' + encodeURIComponent(trip.id)
          : '/s/' + guestToken(trip),
      },
    ]),
  );
}

export function requestFriend(userId: string, targetId: string) {
  targetUser(userId, targetId);
  return db
    .transaction(() => {
      const state = relationship(userId, targetId);
      if (state === 'incoming')
        fail(409, 'messages.youAlreadyHaveARequestFromThis');
      if (state !== 'none') return state;
      ensureUsername(userId);
      ensureUsername(targetId);
      const [a, b] = pair(userId, targetId);
      run(
        "INSERT INTO friendships(user_a,user_b,requested_by,status,created) VALUES (?,?,?,'pending',?)",
        a,
        b,
        userId,
        Date.now(),
      );
      return 'outgoing' as Relationship;
    })
    .immediate();
}

export function acceptFriend(userId: string, targetId: string) {
  targetUser(userId, targetId);
  return db
    .transaction(() => {
      const state = relationship(userId, targetId);
      if (state === 'friends') return state;
      if (state !== 'incoming')
        fail(403, 'messages.onlyTheRecipientCanAcceptARequest');
      const [a, b] = pair(userId, targetId);
      run(
        "UPDATE friendships SET status='accepted' WHERE user_a=? AND user_b=? AND status='pending' AND requested_by<>?",
        a,
        b,
        userId,
      );
      return 'friends' as Relationship;
    })
    .immediate();
}

export function removeFriend(userId: string, targetId: string) {
  targetUser(userId, targetId);
  const [a, b] = pair(userId, targetId);
  run('DELETE FROM friendships WHERE user_a=? AND user_b=?', a, b);
  return 'none' as Relationship;
}
