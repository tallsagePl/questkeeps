import { all, one } from './db';
import type { TripCover, TripCoverSettings, CoverPosition } from './contracts';

// Card previews obey the same date and visibility boundaries as their viewer.
export function tripCovers(
  tripId: string,
  userId: string,
  guestToken?: string,
): TripCover[] {
  const photos = all<{
    id: string;
    rotation: number;
    revision: string;
    x: number | null;
    y: number | null;
  }>(
    `SELECT m.id,m.rotation,m.revision,cp.x,cp.y FROM media_favorites f
     JOIN media m ON m.id=f.media_id JOIN sources s ON s.id=m.source_id
     JOIN trips t ON t.id=m.trip_id
     LEFT JOIN trip_cover_positions cp ON cp.trip_id=t.id AND cp.media_id=m.id
     LEFT JOIN trip_cover_settings cs ON cs.trip_id=t.id
     LEFT JOIN members mb ON mb.trip_id=t.id AND mb.user_id=? AND mb.active=1
     WHERE m.trip_id=? AND f.user_id=t.owner_id
       AND (COALESCE(cs.mode,'all')='all' OR m.id IN (SELECT value FROM json_each(cs.photo_ids) WHERE CAST(key AS INTEGER)<5)) AND m.kind='photo'
       AND m.hidden=0 AND m.missing=0 AND s.approved=1
       AND substr(m.taken,1,10) BETWEEN t.start AND t.end
       AND (?=1 AND m.hidden_from_guests=0 OR ?=0 AND
         (t.owner_id=? OR mb.user_id IS NOT NULL AND
           (mb.all_photos=1 OR substr(m.taken,1,10) BETWEEN mb.start AND mb.end)))
     ORDER BY m.taken,m.id`,
    userId,
    tripId,
    Number(!!guestToken),
    Number(!!guestToken),
    userId,
  );
  return photos.map((photo) => ({
    id: photo.id,
    rotation: photo.rotation,
    position: { x: photo.x ?? 50, y: photo.y ?? 50 },
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

export function coverSettings(tripId: string): TripCoverSettings {
  const row = one<{ mode: 'all' | 'selected'; photo_ids: string }>(
    'SELECT mode,photo_ids FROM trip_cover_settings WHERE trip_id=?',
    tripId,
  );
  const positions = Object.fromEntries(
    all<{ media_id: string; x: number; y: number }>(
      'SELECT media_id,x,y FROM trip_cover_positions WHERE trip_id=?',
      tripId,
    ).map(({ media_id, x, y }) => [media_id, { x, y } as CoverPosition]),
  );
  return row
    ? {
        mode: row.mode,
        photoIds: JSON.parse(row.photo_ids).slice(0, 5),
        positions,
      }
    : { mode: 'all', photoIds: [], positions };
}
