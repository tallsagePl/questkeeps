import { one } from './db';

// Keep stored captions (including legacy values of unknown origin). New place
// captions are derived from the current links so removing a link updates them.
export const mediaTitleSql = `COALESCE(
  (SELECT title FROM media_titles WHERE media_id=m.id),
  (SELECT substr(title,1,160) FROM confirmed_places
    WHERE trip_id=m.trip_id AND media_id=m.id ORDER BY rowid DESC LIMIT 1)
)`;

export function mediaTitle(mediaId: string) {
  return (
    one<{ title: string | null }>(
      `SELECT ${mediaTitleSql} title FROM media m WHERE m.id=?`,
      mediaId,
    )?.title ?? null
  );
}
