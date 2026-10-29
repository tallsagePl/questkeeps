import { all } from './db';
import type { TripCover } from './contracts';

// Card previews obey the same date and visibility boundaries as their viewer.
export function tripCovers(
  tripId: string,
  userId: string,
  guestToken?: string,
): TripCover[] {
  const photos = all<{ id: string; rotation: number; revision: string }>(
    `SELECT m.id,m.rotation,m.revision FROM media_favorites f
     JOIN media m ON m.id=f.media_id JOIN sources s ON s.id=m.source_id
     JOIN trips t ON t.id=m.trip_id
     LEFT JOIN members mb ON mb.trip_id=t.id AND mb.user_id=? AND mb.active=1
     WHERE m.trip_id=? AND f.user_id=? AND m.kind='photo'
       AND m.hidden=0 AND m.missing=0 AND s.approved=1
       AND substr(m.taken,1,10) BETWEEN t.start AND t.end
       AND (?=1 AND m.hidden_from_guests=0 OR ?=0 AND
         (t.owner_id=? OR mb.user_id IS NOT NULL AND
           (mb.all_photos=1 OR substr(m.taken,1,10) BETWEEN mb.start AND mb.end)))
     ORDER BY m.taken,m.id LIMIT 12`,
    userId,
    tripId,
    userId,
    Number(!!guestToken),
    Number(!!guestToken),
    userId,
  );
  return photos.map((photo) => ({
    id: photo.id,
    rotation: photo.rotation,
    src:
      '/api/media/' +
      encodeURIComponent(photo.id) +
      '/preview?' +
      new URLSearchParams({
        revision: photo.revision,
        ...(guestToken ? { share: guestToken } : {}),
      }),
  }));
}
