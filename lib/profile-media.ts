import { all, one } from './db';
import { fail, requireUser } from './access';

// This private author view never grants access through friendship or a guest link.
export function ownProfileMedia(req: Request, id: string) {
  const user = requireUser(req);
  const media = one(
    'SELECT m.*,s.account_id FROM media m JOIN sources s ON s.id=m.source_id JOIN accounts a ON a.id=s.account_id WHERE m.id=? AND m.user_id=? AND s.user_id=? AND a.user_id=? AND m.missing=0',
    id,
    user.id,
    user.id,
    user.id,
  );
  return media || fail(404, 'profileFiles.fileUnavailable');
}

export function profileMediaGroups(userId: string) {
  return all(
    'SELECT t.id,t.title,COUNT(*) count FROM media m JOIN trips t ON t.id=m.trip_id WHERE m.user_id=? GROUP BY t.id ORDER BY MAX(m.taken) DESC,t.id',
    userId,
  );
}

export function profileMediaPage(userId: string, url: URL) {
  const trip = url.searchParams.get('trip');
  if (!trip || trip.length > 100) fail(400, 'messages.chooseATrip');
  let cursor: { taken: string; id: string } | undefined;
  const raw = url.searchParams.get('cursor');
  if (raw) {
    try {
      const value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
      if (
        typeof value.taken !== 'string' ||
        typeof value.id !== 'string' ||
        value.taken.length > 100 ||
        value.id.length > 100 ||
        raw.length > 600
      )
        throw Error();
      cursor = value;
    } catch {
      fail(400, 'messages.invalidPage');
    }
  }
  const rows = all(
    'SELECT m.id,m.name,m.kind,m.revision,m.rotation,m.taken,m.hidden,m.hidden_from_guests,m.missing,COALESCE((SELECT title FROM media_titles WHERE media_id=m.id),(SELECT substr(title,1,160) FROM confirmed_places WHERE media_id=m.id ORDER BY rowid DESC LIMIT 1)) title FROM media m WHERE m.user_id=? AND m.trip_id=?' +
      (cursor ? ' AND (m.taken<? OR (m.taken=? AND m.id<?))' : '') +
      ' ORDER BY m.taken DESC,m.id DESC LIMIT 31',
    userId,
    trip,
    ...(cursor ? [cursor.taken, cursor.taken, cursor.id] : []),
  );
  const media = rows.slice(0, 30);
  const last = media.at(-1);
  return {
    media,
    next:
      rows.length > 30 && last
        ? Buffer.from(
            JSON.stringify({ taken: last.taken, id: last.id }),
          ).toString('base64url')
        : null,
  };
}

export function sharedProfileTrips(viewerId: string, targetId: string) {
  if (viewerId === targetId) return [];
  // Both people must still participate, and their permitted dates must overlap.
  return all(
    'SELECT t.id,t.title,MAX(t.start,CASE WHEN t.owner_id=? THEN t.start ELSE a.start END,CASE WHEN t.owner_id=? THEN t.start ELSE b.start END) start,MIN(t.end,CASE WHEN t.owner_id=? THEN t.end ELSE a.end END,CASE WHEN t.owner_id=? THEN t.end ELSE b.end END) end FROM trips t LEFT JOIN members a ON a.trip_id=t.id AND a.user_id=? AND a.active=1 LEFT JOIN members b ON b.trip_id=t.id AND b.user_id=? AND b.active=1 WHERE (t.owner_id=? OR a.user_id IS NOT NULL) AND (t.owner_id=? OR b.user_id IS NOT NULL) ORDER BY t.start DESC,t.id',
    viewerId,
    targetId,
    viewerId,
    targetId,
    viewerId,
    targetId,
    viewerId,
    targetId,
  ).filter((t) => t.start <= t.end);
}
