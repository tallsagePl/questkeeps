import { storeMessage } from './i18n/messages';
import { readPhotoExif, captureDay } from './photo-metadata';
import { db, one, all, run, id, Row } from './db';
import { disk, inside, Resource } from './yandex';
import { fail, inRange, HttpError } from './access';

export async function syncSource(sourceId: string) {
  const s = one(
    'SELECT s.*,t.start trip_start,t.end trip_end,t.owner_id FROM sources s JOIN trips t ON t.id=s.trip_id WHERE s.id=?',
    sourceId,
  );
  if (!s || !s.approved) fail(403, 'errors.sourceNotApproved');
  const lease = id();
  if (
    !run(
      'UPDATE sources SET lock_until=?,lock_id=? WHERE id=? AND lock_until<?',
      Date.now() + 180000,
      lease,
      sourceId,
      Date.now(),
    ).changes
  )
    return { busy: true };
  let count = 0;
  try {
    const member = one(
      'SELECT * FROM members WHERE trip_id=? AND user_id=? AND active=1',
      s.trip_id,
      s.user_id,
    );
    if (s.user_id !== s.owner_id && !member) return { paused: true };
    const from = member?.start || s.trip_start;
    const to = member?.end || s.trip_end;
    const queue = [s.path];
    const seen = new Set<string>();
    const items: Row[] = [];
    let pages = 0;
    const started = Date.now();
    while (queue.length) {
      const folder = queue.shift()!;
      if (seen.has(folder)) continue;
      seen.add(folder);
      let offset = 0;
      while (true) {
        if (++pages > 2000 || Date.now() - started > 15 * 60000)
          fail(422, 'errors.folderTooLarge');
        if (
          !run(
            'UPDATE sources SET lock_until=? WHERE id=? AND lock_id=?',
            Date.now() + 180000,
            s.id,
            lease,
          ).changes
        )
          fail(409, 'messages.synchronizationWasRestarted');
        const page = (await disk(s.account_id, 'resources', {
          path: folder,
          limit: '100',
          offset: String(offset),
          sort: 'name',
        })) as Resource;
        if (!page._embedded) fail(422, 'errors.sourceMustBeFolder');
        for (const r of page._embedded.items) {
          if (Date.now() - started > 15 * 60000)
            fail(422, 'messages.scanningTookTooLongChooseASmaller');
          if (
            !run(
              'UPDATE sources SET lock_until=? WHERE id=? AND lock_id=?',
              Date.now() + 180000,
              s.id,
              lease,
            ).changes
          )
            fail(409, 'messages.synchronizationWasRestarted');
          if (!inside(r.path, s.path)) continue;
          if (r.type === 'dir') {
            queue.push(r.path);
            continue;
          }
          if (!r.mime_type?.match(/^(image|video)\//)) continue;
          const previous = one(
            'SELECT * FROM media WHERE source_id=? AND resource_id=?',
            s.id,
            r.resource_id || r.path,
          );
          const unchanged =
            previous &&
            previous.revision === String(r.revision || r.modified || '');
          const info: Row = unchanged
            ? {}
            : await readPhotoExif(s.account_id, r);
          let date = unchanged
            ? previous.taken
            : captureDay(r, info) || r.created;
          if (!date || Number.isNaN(Date.parse(date))) continue;
          date = date.slice(0, 10);
          if (
            !inRange(date, s.trip_start, s.trip_end) ||
            !inRange(date, from, to)
          )
            continue;
          items.push({
            rid: r.resource_id || r.path,
            path: r.path,
            name: r.name,
            mime: r.mime_type,
            kind: r.mime_type.startsWith('video/') ? 'video' : 'photo',
            taken: date,
            basis: unchanged
              ? previous.date_basis
              : info.DateTimeOriginal || r.exif?.date_time
                ? 'exif'
                : r.photoslice_time
                  ? 'disk'
                  : 'upload',
            lat: unchanged
              ? previous.lat
              : typeof info.latitude === 'number'
                ? info.latitude
                : null,
            lon: unchanged
              ? previous.lon
              : typeof info.longitude === 'number'
                ? info.longitude
                : null,
            revision: String(r.revision || r.modified || ''),
          });
        }
        offset += page._embedded.items.length;
        if (offset >= page._embedded.total) break;
        if (!page._embedded.items.length)
          fail(502, 'errors.incompleteDiskResponse');
      }
    }
    db.transaction(() => {
      if (
        one('SELECT lock_id FROM sources WHERE id=?', s.id)?.lock_id !== lease
      )
        fail(409, 'messages.synchronizationWasRestarted');
      const latestSource = one('SELECT approved FROM sources WHERE id=?', s.id);
      if (!latestSource?.approved)
        fail(403, 'messages.sourceApprovalWasRevoked');
      if (s.user_id !== s.owner_id) {
        const latestMember = one(
          'SELECT * FROM members WHERE trip_id=? AND user_id=? AND active=1',
          s.trip_id,
          s.user_id,
        );
        if (
          !latestMember ||
          latestMember.start !== from ||
          latestMember.end !== to
        )
          fail(
            409,
            'messages.participationDatesChangedRunSynchronizationAgain',
          );
      }
      if (
        !one(
          'SELECT id FROM accounts WHERE id=? AND disk_enabled=1',
          s.account_id,
        )
      )
        fail(409, 'messages.yandexAccountDisconnectedReconnectItInYour');
      run('UPDATE media SET missing=1 WHERE source_id=?', s.id);
      const statement = db.prepare(
        'INSERT INTO media (id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis,lat,lon,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id,resource_id) DO UPDATE SET path=excluded.path,name=excluded.name,mime=excluded.mime,kind=excluded.kind,taken=excluded.taken,date_basis=excluded.date_basis,lat=excluded.lat,lon=excluded.lon,revision=excluded.revision,missing=0',
      );
      for (const m of items)
        statement.run(
          id(),
          s.id,
          s.trip_id,
          s.user_id,
          m.rid,
          m.path,
          m.name,
          m.mime,
          m.kind,
          m.taken,
          m.basis,
          m.lat,
          m.lon,
          m.revision,
        );
      run(
        'UPDATE sources SET last_sync=?,error=NULL WHERE id=?',
        Date.now(),
        s.id,
      );
    })();
    count = items.length;
    return { count };
  } catch (error) {
    run(
      'UPDATE sources SET error=? WHERE id=? AND lock_id=?',
      error instanceof HttpError && error.translation
        ? storeMessage(error.translation)
        : error instanceof Error
          ? error.message
          : 'trip.couldNotSynchronizeTheFolder',
      s.id,
      lease,
    );
    throw error;
  } finally {
    run(
      'UPDATE sources SET lock_until=0,lock_id=NULL WHERE id=? AND lock_id=?',
      s.id,
      lease,
    );
  }
}

export async function syncDue() {
  const sources = all(
    'SELECT s.id FROM sources s JOIN trips t ON t.id=s.trip_id JOIN accounts a ON a.id=s.account_id WHERE a.disk_enabled=1 AND s.approved=1 AND s.lock_until<? AND (s.last_sync IS NULL OR s.last_sync<?) AND (s.user_id=t.owner_id OR EXISTS (SELECT 1 FROM members m WHERE m.trip_id=s.trip_id AND m.user_id=s.user_id AND m.active=1)) ORDER BY s.last_sync LIMIT 25',
    Date.now(),
    Date.now() - 15 * 60000,
  );
  const result = [];
  for (const s of sources) {
    try {
      result.push({ id: s.id, ...(await syncSource(s.id)) });
    } catch {
      result.push({ id: s.id, error: true });
    }
  }
  return result;
}
