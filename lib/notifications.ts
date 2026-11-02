import { guestToken } from './guest-links';
import { MemoryCache } from './memory-cache';
import { all, one, run, db, hash } from './db';
import { friendLists } from './friends';

type Person = ReturnType<typeof friendLists>['friends'][number];

type Drive = {
  id: string;
  title: string;
  count: number;
  newest: number;
  stamp: string;
};

type FollowUpdate = {
  id: string;
  title: string;
  count: number;
  notes: number;
  stamp: string;
  url: string;
};

type State = {
  follow?: Record<string, FollowUpdate>;
  friends: string[];
  outgoing: string[];
  accepted: Person[];
  drive: Record<string, Drive>;
  seen: string[];
};

function stateFor(userId: string): State {
  const row = one(
    'SELECT snapshot FROM notification_state WHERE user_id=?',
    userId,
  );
  return row
    ? JSON.parse(row.snapshot)
    : { friends: [], outgoing: [], accepted: [], drive: {}, seen: [] };
}

function save(userId: string, state: State) {
  run(
    'INSERT INTO notification_state VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET snapshot=excluded.snapshot,updated=excluded.updated WHERE notification_state.snapshot<>excluded.snapshot',
    userId,
    JSON.stringify(state),
    Date.now(),
  );
}

const snapshotCache = new MemoryCache<
  string,
  { version: number; drive: Drive[]; follows: FollowUpdate[] }
>(900000, 64);

function snapshots(userId: string) {
  const version = one('SELECT version FROM app_clock WHERE id=1')!
    .version as number;
  const old = snapshotCache.get(userId);
  if (old?.version === version) return old;
  const drive = driveFor(userId);
  const follows = all(
    `SELECT t.id,t.title,t.share_hash,
  (SELECT COUNT(*) FROM media m JOIN sources s ON s.id=m.source_id WHERE m.trip_id=t.id AND m.hidden=0 AND m.hidden_from_guests=0 AND m.missing=0 AND s.approved=1 AND substr(m.taken,1,10) BETWEEN t.start AND t.end) count,
  (SELECT GROUP_CONCAT(m.id ORDER BY m.id) FROM media m JOIN sources s ON s.id=m.source_id WHERE m.trip_id=t.id AND m.hidden=0 AND m.hidden_from_guests=0 AND m.missing=0 AND s.approved=1 AND substr(m.taken,1,10) BETWEEN t.start AND t.end) frames,
  (SELECT COUNT(*) FROM notes n WHERE n.trip_id=t.id AND n.day BETWEEN t.start AND t.end AND length(n.text)>0) notes,
  (SELECT GROUP_CONCAT(n.id ORDER BY n.id) FROM notes n WHERE n.trip_id=t.id AND n.day BETWEEN t.start AND t.end AND length(n.text)>0) entries
  FROM trip_follows f JOIN trips t ON t.id=f.trip_id WHERE f.user_id=? AND f.share_hash=t.share_hash AND t.share_hash IS NOT NULL`,
    userId,
  ).map((t) => ({
    id: t.id,
    title: t.title,
    count: t.count,
    notes: t.notes,
    stamp: hash(JSON.stringify([t.frames, t.entries])),
    url: '/s/' + guestToken(t as { id: string; share_hash: string }),
  })) as FollowUpdate[];
  const result = { version, drive, follows };
  snapshotCache.set(userId, result);
  return result;
}

function driveFor(userId: string): Drive[] {
  return all(
    "SELECT t.id,t.title,COUNT(DISTINCT a.yandex_id||':'||m.resource_id) count,COALESCE(MAX(m.rowid),0) newest,GROUP_CONCAT(DISTINCT a.yandex_id||':'||m.resource_id ORDER BY a.yandex_id||':'||m.resource_id) stamp FROM trips t JOIN sources s ON s.trip_id=t.id JOIN accounts a ON a.id=s.account_id LEFT JOIN media m ON m.source_id=s.id AND m.missing=0 WHERE s.user_id=? AND s.approved=1 AND a.disk_enabled=1 AND (t.owner_id=? OR EXISTS(SELECT 1 FROM members mb WHERE mb.trip_id=t.id AND mb.user_id=? AND mb.active=1)) GROUP BY t.id ORDER BY t.id",
    userId,
    userId,
    userId,
  ).map((trip) => ({ ...trip, stamp: hash(trip.stamp || '') })) as Drive[];
}

export function notificationSnapshot(userId: string) {
  return db
    .transaction(() => {
      const state = stateFor(userId);
      const friends = friendLists(userId);
      for (const person of friends.friends) {
        if (
          state.outgoing.includes(person.id) &&
          !state.friends.includes(person.id) &&
          !state.accepted.some((p) => p.id === person.id)
        )
          state.accepted.unshift(person);
      }
      state.friends = friends.friends.map((p) => p.id);
      state.outgoing = friends.outgoing.map((p) => p.id);
      state.accepted = state.accepted
        .filter((p) => state.friends.includes(p.id))
        .slice(0, 50);
      const { drive, follows } = snapshots(userId);
      state.follow ||= {};
      const followChanges: FollowUpdate[] = [];
      for (const trip of follows) {
        const previous = state.follow[trip.id];
        if (!previous) state.follow[trip.id] = trip;
        else if (
          trip.stamp !== previous.stamp &&
          (trip.count >= previous.count || trip.notes > previous.notes)
        )
          followChanges.push(trip);
        else if (trip.count < previous.count || trip.notes < previous.notes)
          state.follow[trip.id] = trip;
      }
      const followed = new Set(follows.map((t) => t.id));
      state.follow = Object.fromEntries(
        Object.entries(state.follow).filter(([id]) => followed.has(id)),
      );

      const driveChanges: Drive[] = [];
      for (const trip of drive) {
        const previous = state.drive[trip.id];
        if (!previous) state.drive[trip.id] = trip;
        else if (
          trip.stamp !== previous.stamp &&
          (trip.newest > previous.newest || trip.count >= previous.count)
        )
          driveChanges.push(trip);
        else if (trip.count < previous.count) state.drive[trip.id] = trip;
      }
      const active = new Set(drive.map((trip) => trip.id));
      state.drive = Object.fromEntries(
        Object.entries(state.drive).filter(([id]) => active.has(id)),
      );
      const invitationIds = all(
        'SELECT id FROM trip_invitations WHERE recipient_id=? AND expires>?',
        userId,
        Date.now(),
      );
      const activeKeys = new Set([
        ...invitationIds.map((row) => 'invite:' + row.id),
        ...friends.incoming.map((person) => 'friend:' + person.id),
        ...state.accepted.map((person) => 'accepted:' + person.id),
        ...driveChanges.map((trip) => 'drive:' + trip.id + ':' + trip.stamp),
        ...followChanges.map((trip) => 'follow:' + trip.id + ':' + trip.stamp),
      ]);
      state.seen = state.seen.filter((key) => activeKeys.has(key));
      save(userId, state);
      return {
        friends,
        drive,
        driveChanges,
        followChanges,
        accepted: state.accepted,
        seen: state.seen,
      };
    })
    .immediate();
}

export function readNotifications(userId: string, keys: string[]) {
  db.transaction(() => {
    const state = stateFor(userId);
    state.seen = [...new Set([...state.seen, ...keys])].slice(-300);
    save(userId, state);
  }).immediate();
}

export function refreshDriveNotification(userId: string, tripId: string) {
  db.transaction(() => {
    const state = stateFor(userId);
    const current = driveFor(userId).find((trip) => trip.id === tripId);
    if (current) state.drive[tripId] = current;
    save(userId, state);
  }).immediate();
}
