import { queueSourceSync } from '../source-jobs';
import {
  notificationSnapshot,
  readNotifications,
  refreshDriveNotification,
} from '../notifications';
import { cookie } from '../access';
import { hash } from '../db';
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
  if (p[1] === 'read' && !p[2] && method === 'POST') {
    const input = z
      .object({ keys: z.array(z.string().max(200)).max(300) })
      .strict()
      .parse(await body(req));
    readNotifications(u.id, input.keys);
    return json({ ok: true });
  }
  if (p[1] === 'drive-read' && !p[2] && method === 'POST') {
    const input = z
      .object({ tripId: z.string().min(1).max(100) })
      .strict()
      .parse(await body(req));
    refreshDriveNotification(u.id, input.tripId);
    return json({ ok: true });
  }
  if (p[1] === 'check-drive' && !p[2] && method === 'POST') {
    // One check per authenticated session, not per page or browser tab. The
    // worker scans the selected folders; this request never waits on Yandex.
    const sessionHash = hash(cookie(req, 'ta_session') || '');
    const session = one(
      'SELECT expires FROM sessions WHERE hash=? AND user_id=? AND expires>?',
      sessionHash,
      u.id,
      Date.now(),
    );
    if (!session) fail(401, 'messages.accessDenied');
    const queued = db
      .transaction(() => {
        const first = run(
          'INSERT OR IGNORE INTO throttle(key,count,until) VALUES (?,1,?)',
          'drive-session:' + sessionHash,
          session.expires,
        ).changes;
        if (!first) return 0;
        const sources = all(
          `SELECT s.id FROM sources s JOIN accounts a ON a.id=s.account_id JOIN trips t ON t.id=s.trip_id
          WHERE s.user_id=? AND s.approved=1 AND a.disk_enabled=1 AND (t.owner_id=? OR EXISTS(SELECT 1 FROM members m WHERE m.trip_id=t.id AND m.user_id=? AND m.active=1))`,
          u.id,
          u.id,
          u.id,
        );
        for (const source of sources) queueSourceSync(source.id, false);
        return sources.length;
      })
      .immediate();
    return json({ queued });
  }
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
    return json({ invitations, count, ...notificationSnapshot(u.id) });
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
