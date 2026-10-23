import { z } from 'zod';
import { all, one, run, id } from './db';
import { fail } from './access';
import { ensureUsername, publicProfile } from './profiles';
import { day, bounds } from './api/http';

export const invitationOptions = z
  .object({
    start: day,
    end: day,
    allPhotos: z.boolean().default(false),
    recipientId: z.string().min(1).max(100).optional(),
  })
  .strict()
  .refine((v) => v.start <= v.end, 'messages.endDateIsEarlierThanTheStart');

export function findInvitees(raw: string, tripId: string, ownerId: string) {
  const query = raw.trim().replace(/^@/, '').toLowerCase();
  if (query.length < 3 || query.length > 254) return [];
  const email = query.includes('@');
  const rows = all(
    'SELECT u.id FROM users u LEFT JOIN user_handles h ON h.user_id=u.id WHERE u.id<>? AND NOT EXISTS(SELECT 1 FROM members m WHERE m.trip_id=? AND m.user_id=u.id AND m.active=1) AND ' +
      (email ? 'lower(u.email)=?' : 'substr(lower(h.username),1,length(?))=?') +
      ' ORDER BY h.username,u.id LIMIT 12',
    ownerId,
    tripId,
    query,
    ...(email ? [] : [query]),
  );
  return rows.map((row) => publicProfile(ensureUsername(row.id)));
}

export function joinTrip(
  tripId: string,
  userId: string,
  options: { start: string; end: string; all_photos: number },
) {
  const trip =
    one('SELECT * FROM trips WHERE id=?', tripId) ||
    fail(404, 'messages.tripNotFound');
  if (trip.owner_id === userId) fail(400, 'messages.youAlreadyOwnThisTrip');
  if (
    one(
      'SELECT 1 FROM members WHERE trip_id=? AND user_id=? AND active=1',
      tripId,
      userId,
    )
  )
    fail(409, 'messages.youAlreadyParticipateInThisTrip');
  bounds(
    { start: options.start, end: options.end },
    { start: trip.start, end: trip.end },
  );
  run(
    'INSERT INTO members(trip_id,user_id,start,end,active,all_photos) VALUES(?,?,?,?,1,?) ON CONFLICT(trip_id,user_id) DO UPDATE SET start=excluded.start,end=excluded.end,active=1,all_photos=excluded.all_photos',
    tripId,
    userId,
    options.start,
    options.end,
    options.all_photos,
  );
  run(
    'DELETE FROM trip_invitations WHERE trip_id=? AND recipient_id=?',
    tripId,
    userId,
  );
}

export function sendTripInvitation(
  tripId: string,
  sender: string,
  recipient: string,
  options: { start: string; end: string; allPhotos: boolean },
) {
  if (sender === recipient) fail(400, 'messages.youAlreadyOwnThisTrip');
  if (!one('SELECT 1 FROM users WHERE id=?', recipient))
    fail(404, 'tripDescription.userNotFound');
  if (
    one(
      'SELECT 1 FROM members WHERE trip_id=? AND user_id=? AND active=1',
      tripId,
      recipient,
    )
  )
    fail(409, 'messages.youAlreadyParticipateInThisTrip');
  const existing = one(
    'SELECT expires FROM trip_invitations WHERE trip_id=? AND recipient_id=?',
    tripId,
    recipient,
  );
  if (existing && existing.expires > Date.now())
    fail(409, 'invitations.alreadySent');
  run(
    'INSERT INTO trip_invitations(id,trip_id,sender_id,recipient_id,start,end,all_photos,created,expires) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(trip_id,recipient_id) DO UPDATE SET id=excluded.id,sender_id=excluded.sender_id,start=excluded.start,end=excluded.end,all_photos=excluded.all_photos,created=excluded.created,expires=excluded.expires',
    id(),
    tripId,
    sender,
    recipient,
    options.start,
    options.end,
    Number(options.allPhotos),
    Date.now(),
    Date.now() + 7 * 86400000,
  );
}
