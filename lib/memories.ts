import { all, type Row } from './db';

export function anniversaryMemories(userId: string, date: string) {
  const match = /^(\d{4})-(\d{2}-\d{2})$/.exec(date);
  if (
    !match ||
    Number.isNaN(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw Error('Invalid anniversary date');
  return all<
    Row & {
      id: string;
      tripId: string;
      title: string;
      taken: string;
      tripTitle: string;
      revision: string;
    }
  >(
    `SELECT m.id,m.trip_id tripId,m.name title,m.taken,t.title tripTitle,m.revision FROM media m
  JOIN sources s ON s.id=m.source_id JOIN trips t ON t.id=m.trip_id LEFT JOIN members mb ON mb.trip_id=t.id AND mb.user_id=? AND mb.active=1
  WHERE m.kind='photo' AND m.hidden=0 AND m.missing=0 AND s.approved=1 AND substr(m.taken,6,5)=? AND substr(m.taken,1,4)<?
   AND substr(m.taken,1,10) BETWEEN t.start AND t.end
   AND (t.owner_id=? OR mb.user_id IS NOT NULL AND (mb.all_photos=1 OR substr(m.taken,1,10) BETWEEN mb.start AND mb.end))
  ORDER BY m.taken DESC,m.id LIMIT 6`,
    userId,
    match[2],
    match[1],
    userId,
  ).map((m) => ({
    ...m,
    url: '/?trip=' + encodeURIComponent(m.tripId),
    preview:
      '/api/media/' +
      encodeURIComponent(m.id) +
      '/preview?' +
      new URLSearchParams({ revision: m.revision || '1' }),
  }));
}
