import { tripCovers } from '../trip-covers';
import { z } from 'zod';
import { one, all, run } from '../db';
import { guestTrip, guestToken } from '../guest-links';
import { cookie, requireUser, fail, throttle } from '../access';
import { appURL, body, json } from './http';
import type { RequestContext } from './context';
import type { FollowedTrip } from '../contracts';

type SharedTrip = { id: string; owner_id: string; share_hash: string };

const pendingCookie = 'qk_follow_trip';

const input = z.object({ token: z.string().min(1).max(200) }).strict();

function sharedTrip(raw: string) {
  const shared = guestTrip(raw);
  return shared
    ? one<SharedTrip>(
        'SELECT id,owner_id,share_hash FROM trips WHERE id=? AND share_hash=?',
        shared.id,
        shared.share_hash,
      )
    : undefined;
}

function save(userId: string, trip: { id: string; share_hash: string }) {
  run(
    'INSERT INTO trip_follows VALUES (?,?,?,?) ON CONFLICT(user_id,trip_id) DO UPDATE SET share_hash=excluded.share_hash',
    userId,
    trip.id,
    trip.share_hash,
    Date.now(),
  );
}

export async function followRoutes({
  req,
  p,
  method,
}: RequestContext): Promise<Response | undefined> {
  if (p[0] !== 'follows') return;
  const options = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: new URL(appURL()).protocol === 'https:',
  };
  if (p[1] === 'pending' && !p[2] && method === 'POST') {
    const value = input.parse(await body(req));
    if (!sharedTrip(value.token))
      fail(404, 'messages.thisGuestLinkIsNoLongerValid');
    const response = json({ ok: true });
    response.cookies.set(pendingCookie, value.token, {
      ...options,
      maxAge: 86400,
    });
    return response;
  }
  const user = requireUser(req);
  if (p[1] === 'accept' && !p[2] && method === 'POST') {
    const raw = cookie(req, pendingCookie);
    if (!raw) return json({ accepted: false });
    const trip = sharedTrip(raw);
    const accepted = !!trip && trip.owner_id !== user.id;
    if (trip && accepted) save(user.id, trip);
    const response = json({
      accepted,
      url: trip && accepted ? '/s/' + guestToken(trip) : null,
    });
    response.cookies.set(pendingCookie, '', { ...options, maxAge: 0 });
    return response;
  }
  if (!p[1] && method === 'GET') {
    const rows = all<
      Omit<FollowedTrip, 'url'> & { share_hash: string; owner_id: string }
    >(
      `SELECT t.id,t.title,t.destination,t.start,t.end,t.share_hash,t.owner_id,
      (SELECT count(*) FROM media m JOIN sources s ON s.id=m.source_id WHERE m.trip_id=t.id AND m.hidden=0 AND m.hidden_from_guests=0 AND m.missing=0 AND s.approved=1) media_count
      FROM trip_follows f JOIN trips t ON t.id=f.trip_id
      WHERE f.user_id=? AND t.share_hash IS NOT NULL AND f.share_hash=t.share_hash ORDER BY f.created DESC,t.id`,
      user.id,
    );
    return json({
      trips: rows.map((trip) => ({
        id: trip.id,
        title: trip.title,
        destination: trip.destination,
        start: trip.start,
        end: trip.end,
        media_count: trip.media_count,
        url: '/s/' + guestToken(trip),
        covers: tripCovers(trip.id, trip.owner_id, guestToken(trip)!),
      })),
    });
  }
  if ((!p[1] || p[1] === 'status') && !p[2] && method === 'POST') {
    throttle('trip-follow:' + user.id, 120, 60000);
    const value = input.parse(await body(req));
    const trip =
      sharedTrip(value.token) ||
      fail(404, 'messages.thisGuestLinkIsNoLongerValid');
    const canFollow = trip.owner_id !== user.id;
    if (!p[1]) {
      if (!canFollow) fail(400, 'follow.ownTrip');
      save(user.id, trip);
    }
    return json({
      canFollow,
      following: !!one(
        'SELECT 1 FROM trip_follows WHERE user_id=? AND trip_id=? AND share_hash=?',
        user.id,
        trip.id,
        trip.share_hash,
      ),
    });
  }
  if (p[1] && !p[2] && method === 'DELETE') {
    run(
      'DELETE FROM trip_follows WHERE user_id=? AND trip_id=?',
      user.id,
      p[1],
    );
    return json({ following: false });
  }
  fail(404, 'messages.routeNotFound');
}
