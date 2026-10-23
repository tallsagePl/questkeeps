import { sharedProfileTrips } from '../profile-media';
import { publicProfile } from '../profiles';
import { accountAvatar } from '../account-avatar';
import { db, one, run, hash } from '../db';
import { fail, currentUser, requireUser, tripData } from '../access';
import { json } from './http';
import type { RequestContext } from './context';

export async function publicRoutes({
  req,
  p,
  method,
}: RequestContext): Promise<Response | undefined> {
  if (p[0] === 'profiles' && p[1] && method === 'GET') {
    const profile = publicProfile(p[1]) || fail(404, 'errors.profileNotFound');
    if (p[2] === 'shared-trips')
      return json({
        trips: sharedProfileTrips(requireUser(req).id, profile.id),
      });
    if (p[2] === 'avatar') {
      const avatar = one(
        'SELECT image FROM user_avatars WHERE user_id=?',
        profile.id,
      );
      if (!avatar) {
        const account = one(
          'SELECT id FROM accounts WHERE user_id=? AND disk_enabled=1 LIMIT 1',
          profile.id,
        );
        if (account) return accountAvatar(account.id);
        fail(404, 'messages.noProfilePictureUploaded');
      }
      return new Response(new Uint8Array(avatar.image), {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    if (!p[2]) return json({ profile });
  }
  if (p[0] === 'me' && !p[1] && method === 'GET') {
    const u = currentUser(req);
    return json({
      user: u || null,
      yandexEnabled: !!process.env.YANDEX_CLIENT_ID,
    });
  }
  if (p[0] === 'share' && p[1] && method === 'GET') {
    const t =
      one('SELECT id FROM trips WHERE share_hash=?', hash(p[1])) ||
      fail(404, 'messages.thisGuestLinkIsNoLongerValid');
    const next = new URL(req.url);
    next.searchParams.set('share', p[1]);
    return json(tripData(new Request(next, { headers: req.headers }), t.id));
  }
  if (p[0] === 'invites' && p[1]) {
    const invite =
      one(
        'SELECT i.*,t.title,t.destination FROM invites i JOIN trips t ON t.id=i.trip_id WHERE i.hash=? AND i.expires>? AND i.used=0',
        hash(p[1]),
        Date.now(),
      ) || fail(404, 'messages.invitationExpiredOrAlreadyUsed');
    if (method === 'GET')
      return json({
        title: invite.title,
        destination: invite.destination,
        start: invite.start,
        end: invite.end,
      });
    if (method === 'POST') {
      const u = requireUser(req);
      db.transaction(() => {
        if (
          !run('UPDATE invites SET used=1 WHERE hash=? AND used=0', invite.hash)
            .changes
        )
          fail(409, 'messages.invitationAlreadyAccepted');
        const t = one('SELECT * FROM trips WHERE id=?', invite.trip_id)!;
        if (t.owner_id === u.id) fail(400, 'messages.youAlreadyOwnThisTrip');
        if (
          one(
            'SELECT * FROM members WHERE trip_id=? AND user_id=? AND active=1',
            t.id,
            u.id,
          )
        )
          fail(409, 'messages.youAlreadyParticipateInThisTrip');
        run(
          'INSERT INTO members (trip_id,user_id,start,end,active) VALUES (?,?,?,?,1) ON CONFLICT(trip_id,user_id) DO UPDATE SET start=excluded.start,end=excluded.end,active=1',
          t.id,
          u.id,
          invite.start,
          invite.end,
        );
      })();
      return json({ tripId: invite.trip_id });
    }
  }
}
