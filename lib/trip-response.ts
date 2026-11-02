import { db, one, hash } from './db';
import { viewAccess, tripData, currentUser } from './access';
import { json } from './api/http';

// Authorize before looking at validators. A revoked link can never receive 304.
export function tripResponse(req: Request, tripId: string) {
  return db.transaction(() => {
    const access = viewAccess(req, tripId);
    const version = one('SELECT version FROM app_clock WHERE id=1')!.version;
    const etag =
      '"' +
      hash(
        JSON.stringify([
          version,
          tripId,
          access.role,
          access.from,
          access.to,
          currentUser(req)?.id || '',
          access.share_hash,
        ]),
      ) +
      '"';
    if (req.headers.get('if-none-match') === etag)
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'private, no-store',
          Vary: 'Cookie',
        },
      });
    const response = json(tripData(req, tripId));
    response.headers.set('ETag', etag);
    response.headers.set('Vary', 'Cookie');
    return response;
  })();
}
