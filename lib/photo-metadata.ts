import exifr from 'exifr';
import { one, run, hash, Row } from './db';
import { mediaURL, trustedFetch, Resource } from './yandex';
export async function readPhotoExif(
  accountId: string,
  r: Resource,
): Promise<Row> {
  if (
    !['image/jpeg', 'image/heic', 'image/heif', 'image/png'].includes(
      r.mime_type || '',
    )
  )
    return {}; // Metadata is read in memory, never saved as a file.
  const key = hash(
    accountId +
      '|' +
      (r.resource_id || r.path) +
      '|' +
      (r.revision || r.modified || ''),
  );
  const cached = one(
    'SELECT json FROM exif_cache WHERE key=? AND updated>?',
    key,
    Date.now() - 86400000,
  );
  if (cached) {
    const data = JSON.parse(cached.json);
    if (
      typeof data.DateTimeOriginal === 'string' &&
      /^\d{4}-\d{2}-\d{2}T/.test(data.DateTimeOriginal)
    )
      data.DateTimeOriginal = new Date(data.DateTimeOriginal);
    return data;
  }
  try {
    const url = await mediaURL({ account_id: accountId, path: r.path });
    const response = await trustedFetch(url, { Range: 'bytes=0-524287' });
    if (!response.ok || !response.body) return { metadataReadFailed: true };
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (length < 524288) {
        const { done, value } = await reader.read();
        if (done) break;
        const part = value.subarray(0, 524288 - length);
        chunks.push(part);
        length += part.length;
      }
    } finally {
      await reader.cancel();
    }
    const info =
      (await exifr.parse(Buffer.concat(chunks), {
        pick: [
          'DateTimeOriginal',
          'OffsetTimeOriginal',
          'GPSLatitude',
          'GPSLongitude',
          'GPSLatitudeRef',
          'GPSLongitudeRef',
        ],
        gps: true,
        reviveValues: false,
      })) || {};
    // Store only metadata. Never store original bytes or a download URL.
    run(
      'INSERT INTO exif_cache VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json,updated=excluded.updated',
      key,
      JSON.stringify(info),
      Date.now(),
    );
    return info;
  } catch {
    return { metadataReadFailed: true };
  }
}
export function captureDay(r: Resource, info: Row): string | null {
  const value = info.DateTimeOriginal;
  // EXIF wall-clock dates have no timezone. Preserve the calendar day as recorded by the camera.
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T]/);
    if (match) {
      const day = match.slice(1).join('-');
      if (
        !Number.isNaN(Date.parse(day)) &&
        new Date(day).toISOString().slice(0, 10) === day
      )
        return day;
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  for (const candidate of [r.exif?.date_time, r.photoslice_time]) {
    if (candidate && !Number.isNaN(Date.parse(candidate)))
      return candidate.slice(0, 10);
  }
  return null;
}

export function captureOrder(r: Resource, info: Row): string {
  const day = captureDay(r, info);
  if (!day) return '9999';
  if (info.DateTimeOriginal instanceof Date) {
    const d = info.DateTimeOriginal;
    return (
      day +
      'T' +
      [d.getHours(), d.getMinutes(), d.getSeconds()]
        .map((v) => String(v).padStart(2, '0'))
        .join(':')
    );
  }
  if (typeof info.DateTimeOriginal === 'string')
    return day + 'T' + info.DateTimeOriginal.slice(11, 19);
  return (r.exif?.date_time || r.photoslice_time || day).slice(0, 19);
}
