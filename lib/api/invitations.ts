import { z } from 'zod';
import { all, one, run, db } from '../db';
import { fail } from '../access';
import { joinTrip } from '../trip-invitations';
import { body, json } from './http';
import type { AuthenticatedContext } from './context';

export async function invitationRoutes({
  req,
  p,
  method,
  u,
}: AuthenticatedContext): Promise<Response | undefined> {
  if (p[0] !== 'invitations') return;
  if (!p[1] && method === 'GET') {
    const args = [u.id, Date.now()];
    const invitations = all(
      'SELECT i.id,i.trip_id,t.title,t.destination,u.name sender,i.start,i.end,i.all_photos,i.expires FROM trip_invitations i JOIN trips t ON t.id=i.trip_id JOIN users u ON u.id=i.sender_id WHERE i.recipient_id=? AND i.expires>? ORDER BY i.created DESC,i.id LIMIT 50',
      ...args,
    );
    const count = one(
      'SELECT count(*) n FROM trip_invitations WHERE recipient_id=? AND expires>?',
      ...args,
    )!.n;
    return json({ invitations, count });
  }
  if (p[1] && !p[2] && method === 'POST') {
    const input = z
      .object({ action: z.enum(['accept', 'decline']) })
      .strict()
      .parse(await body(req));
    let tripId = '';
    db.transaction(() => {
      const invite =
        one(
          'SELECT * FROM trip_invitations WHERE id=? AND recipient_id=? AND expires>?',
          p[1],
          u.id,
          Date.now(),
        ) || fail(404, 'messages.invitationExpiredOrAlreadyUsed');
      tripId = invite.trip_id;
      if (input.action === 'accept')
        joinTrip(invite.trip_id, u.id, {
          start: invite.start,
          end: invite.end,
          all_photos: invite.all_photos,
        });
      else
        run(
          'DELETE FROM trip_invitations WHERE id=? AND recipient_id=?',
          invite.id,
          u.id,
        );
    }).immediate();
    return json({ ok: true, ...(input.action === 'accept' ? { tripId } : {}) });
  }
  fail(404, 'messages.routeNotFound');
}
