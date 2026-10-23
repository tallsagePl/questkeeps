import { joinTrip } from '../trip-invitations';
import { sharedProfileTrips } from '../profile-media';
import { guestTrip } from '../guest-links';
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
      guestTrip(p[1]) || fail(404, 'messages.thisGuestLinkIsNoLongerValid');
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
        allPhotos: !!invite.all_photos,
      });
    if (method === 'POST') {
      const u = requireUser(req);
      db.transaction(() => {
        if (
          !run('UPDATE invites SET used=1 WHERE hash=? AND used=0', invite.hash)
            .changes
        )
          fail(409, 'messages.invitationAlreadyAccepted');
        joinTrip(invite.trip_id, u.id, {
          start: invite.start,
          end: invite.end,
          all_photos: invite.all_photos,
        });
      })();
      return json({ tripId: invite.trip_id });
    }
  }
}
