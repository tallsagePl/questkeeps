import { createHmac, timingSafeEqual } from 'node:crypto';
import { one, hash } from './db';

type SharedTrip = { id: string; share_hash: string | null };

function signature(trip: SharedTrip) {
  const key = process.env.TOKEN_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(key))
    throw Error('Invalid guest-link signing key');
  return createHmac('sha256', Buffer.from(key, 'hex'))
    .update('questkeeps:guest-link:v1:' + trip.id + ':' + trip.share_hash)
    .digest('base64url');
}

// A stable signed alias uses the existing revocation nonce. Legacy links remain valid.
export function guestToken(trip: SharedTrip) {
  return trip.share_hash ? 'v1.' + trip.id + '.' + signature(trip) : null;
}

export function guestTrip(raw: string): SharedTrip | undefined {
  const match = /^v1\.([A-Za-z0-9_-]{1,80})\.([A-Za-z0-9_-]{43})$/.exec(raw);
  if (!match) {
    if (!raw || raw.length > 200 || raw.startsWith('v1.')) return undefined;
    return one<SharedTrip>(
      'SELECT id,share_hash FROM trips WHERE share_hash=?',
      hash(raw),
    );
  }
  const trip = one<SharedTrip>(
    'SELECT id,share_hash FROM trips WHERE id=?',
    match[1],
  );
  if (!trip?.share_hash) return undefined;
  return timingSafeEqual(Buffer.from(match[2]), Buffer.from(signature(trip)))
    ? trip
    : undefined;
}
