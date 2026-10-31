import { id, one, run, type Row } from './db';
import { captureDay } from './photo-metadata';
import { inRange } from './access';
import type { Resource } from './yandex';

export const EXIF_TYPES = new Set([
  'image/jpeg',
  'image/heic',
  'image/heif',
  'image/png',
]);

export function resourceRecord(r: Resource) {
  // Never persist provider download/preview URLs or an unbounded API response.
  return JSON.stringify({
    path: r.path,
    name: r.name,
    type: r.type,
    resource_id: r.resource_id,
    mime_type: r.mime_type,
    created: r.created,
    modified: r.modified,
    revision: r.revision,
    photoslice_time: r.photoslice_time,
    exif: { date_time: r.exif?.date_time },
  });
}

export function publishSourceMedia(s: Row, r: Resource, info?: Row) {
  const rid = r.resource_id || r.path;
  const old = one(
    'SELECT * FROM media WHERE source_id=? AND resource_id=?',
    s.id,
    rid,
  );
  const from = s.user_id === s.owner_id ? s.trip_start : s.member_start;
  const to = s.user_id === s.owner_id ? s.trip_end : s.member_end;
  const recorded = captureDay(r, info || {});
  const unchanged =
    old && old.revision === String(r.revision || r.modified || '');
  const taken = (
    (!info && unchanged ? old.taken : recorded) ||
    old?.taken ||
    r.created ||
    ''
  ).slice(0, 10);
  if (
    !taken ||
    Number.isNaN(Date.parse(taken)) ||
    !inRange(taken, s.trip_start, s.trip_end) ||
    !inRange(taken, from, to)
  ) {
    if (old && info) run('UPDATE media SET missing=1 WHERE id=?', old.id);
    return false;
  }
  if (
    one(
      'SELECT 1 FROM media_exclusions WHERE trip_id=? AND user_id=? AND resource_id=?',
      s.trip_id,
      s.user_id,
      rid,
    )
  )
    return false;
  const manual =
    old &&
    one(
      'SELECT lat,lon FROM media_location_overrides WHERE media_id=?',
      old.id,
    );
  const gps =
    info &&
    Number.isFinite(info.latitude) &&
    Number.isFinite(info.longitude) &&
    Math.abs(info.latitude) <= 90 &&
    Math.abs(info.longitude) <= 180;
  const lat = manual?.lat ?? (gps ? info!.latitude : (old?.lat ?? null));
  const lon = manual?.lon ?? (gps ? info!.longitude : (old?.lon ?? null));
  const basis =
    !info && unchanged
      ? old.date_basis
      : recorded
        ? info?.DateTimeOriginal || r.exif?.date_time
          ? 'exif'
          : 'disk'
        : old?.date_basis || 'upload';
  run(
    `INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis,lat,lon,revision)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id,resource_id) DO UPDATE SET
    path=excluded.path,name=excluded.name,mime=excluded.mime,kind=excluded.kind,taken=excluded.taken,
    date_basis=excluded.date_basis,lat=excluded.lat,lon=excluded.lon,revision=excluded.revision,missing=0
    WHERE media.path IS NOT excluded.path OR media.name IS NOT excluded.name OR media.mime IS NOT excluded.mime
      OR media.kind IS NOT excluded.kind OR media.taken IS NOT excluded.taken OR media.date_basis IS NOT excluded.date_basis
      OR media.lat IS NOT excluded.lat OR media.lon IS NOT excluded.lon OR media.revision IS NOT excluded.revision OR media.missing<>0`,
    old?.id || id(),
    s.id,
    s.trip_id,
    s.user_id,
    rid,
    r.path,
    r.name,
    r.mime_type,
    r.mime_type?.startsWith('video/') ? 'video' : 'photo',
    taken,
    basis,
    lat,
    lon,
    String(r.revision || r.modified || ''),
  );
  if (old && (old.lat !== lat || old.lon !== lon))
    run('DELETE FROM confirmed_places WHERE media_id=?', old.id);
  else if (old && old.taken !== taken)
    run('UPDATE confirmed_places SET day=? WHERE media_id=?', taken, old.id);
  return true;
}
