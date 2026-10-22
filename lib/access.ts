import { ensureUsername, descriptionMentions } from './profiles';
import { addMapDetails } from './map-details';
import { one, all, run, hash, token, Row } from './db';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
export function cookie(req: Request, name: string) {
  return (
    (req.headers.get('cookie') || '')
      .split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith(name + '='))
      ?.slice(name.length + 1) || ''
  );
}
export function userProfile(userId: string): Row | undefined {
  const username = ensureUsername(userId);
  const user = one(
    'SELECT u.id,u.email,u.name,(SELECT version FROM user_avatars WHERE user_id=u.id) avatarVersion,(SELECT id FROM accounts WHERE user_id=u.id AND disk_enabled=1 LIMIT 1) yandexAccountId FROM users u WHERE u.id=?',
    userId,
  );
  return user
    ? {
        ...user,
        username,
        linkedEmails: all(
          "SELECT DISTINCT provider_email email FROM accounts WHERE user_id=? AND provider_email IS NOT NULL AND provider_email<>COALESCE(?,'') ORDER BY provider_email",
          userId,
          user.email,
        ).map((row) => row.email),
      }
    : undefined;
}
export function currentUser(req: Request) {
  const s = cookie(req, 'ta_session');
  return s
    ? (() => {
        const session = one(
          'SELECT user_id FROM sessions WHERE hash=? AND expires>?',
          hash(s),
          Date.now(),
        );
        return session ? userProfile(session.user_id) : undefined;
      })()
    : undefined;
}
export function requireUser(req: Request): Row {
  return currentUser(req) || fail(401, 'Сначала войдите в аккаунт');
}
export function session(userId: string) {
  const raw = token();
  run('DELETE FROM sessions WHERE expires<?', Date.now());
  run(
    'INSERT INTO sessions VALUES (?,?,?)',
    hash(raw),
    userId,
    Date.now() + 30 * 86400000,
  );
  return raw;
}
export function sessionCookie(raw: string, seconds = 30 * 86400) {
  return (
    'ta_session=' +
    raw +
    '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' +
    seconds +
    ((process.env.APP_URL || '').startsWith('https:') ? '; Secure' : '')
  );
}
export function membership(tripId: string, userId: string): Row {
  const trip =
    one('SELECT * FROM trips WHERE id=?', tripId) ||
    fail(404, 'Поездка не найдена');
  if (trip.owner_id === userId)
    return { ...trip, role: 'owner', from: trip.start, to: trip.end };
  const m =
    one(
      'SELECT * FROM members WHERE trip_id=? AND user_id=? AND active=1',
      tripId,
      userId,
    ) || fail(403, 'Нет доступа к поездке');
  return { ...trip, role: 'member', from: m.start, to: m.end };
}
export function owner(tripId: string, userId: string) {
  const t = membership(tripId, userId);
  if (t.role !== 'owner') fail(403, 'Это действие доступно владельцу');
  return t;
}
export function viewAccess(req: Request, tripId: string): Row {
  const share = new URL(req.url).searchParams.get('share');
  if (share) {
    const t = one(
      'SELECT * FROM trips WHERE id=? AND share_hash=?',
      tripId,
      hash(share),
    );
    if (!t) fail(404, 'Ссылка недействительна');
    return { ...t, role: 'guest', from: t.start, to: t.end };
  }
  return membership(tripId, requireUser(req).id);
}
export function inRange(day: string, from: string, to: string) {
  return day >= from && day <= to;
}
export function assertDay(day: string, t: Row) {
  if (!inRange(day, t.from, t.to)) fail(403, 'Дата вне периода вашего участия');
}
export function mediaFor(req: Request, mediaId: string) {
  const m =
    one(
      'SELECT m.*,s.account_id,s.approved FROM media m JOIN sources s ON s.id=m.source_id WHERE m.id=?',
      mediaId,
    ) || fail(404, 'Файл не найден');
  const t = viewAccess(req, m.trip_id);
  assertDay(m.taken.slice(0, 10), t);
  if (m.hidden || m.missing || !m.approved) fail(404, 'Файл недоступен');
  return m;
}
export function throttle(key: string, limit = 10, period = 15 * 60000) {
  const now = Date.now();
  run('DELETE FROM throttle WHERE until<?', now);
  run(
    'INSERT INTO throttle VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1',
    key,
    now + period,
  );
  if (one('SELECT count FROM throttle WHERE key=?', key)!.count > limit)
    fail(429, 'Слишком много попыток. Попробуйте позже');
}
export function tripData(req: Request, tripId: string) {
  const t = viewAccess(req, tripId);
  const user = currentUser(req);
  const media = all(
    'SELECT m.id,m.name,m.kind,m.mime,m.revision,s.account_id _account_id,m.resource_id _resource_id,COALESCE((SELECT title FROM media_titles WHERE media_id=m.id),(SELECT substr(title,1,160) FROM confirmed_places WHERE media_id=m.id ORDER BY rowid DESC LIMIT 1)) title,EXISTS(SELECT 1 FROM media_favorites WHERE media_id=m.id AND user_id=?) favorite,m.taken,m.date_basis,m.lat,m.lon,m.user_id,m.hidden,u.name author FROM media m JOIN sources s ON s.id=m.source_id JOIN users u ON u.id=m.user_id WHERE m.trip_id=? AND s.approved=1 AND m.missing=0 AND substr(m.taken,1,10)>=? AND substr(m.taken,1,10)<=? AND (m.hidden=0 OR m.user_id=?) ORDER BY m.taken',
    t.role === 'guest' ? '' : user?.id || '',
    tripId,
    t.from,
    t.to,
    t.role === 'guest' ? '' : user?.id || '',
  );
  addMapDetails(media);
  const sourceRows =
    t.role === 'guest'
      ? []
      : all(
          'SELECT s.approved,s.last_sync,s.error,s.lock_until,a.disk_enabled,(s.user_id=t.owner_id OR EXISTS (SELECT 1 FROM members mb WHERE mb.trip_id=s.trip_id AND mb.user_id=s.user_id AND mb.active=1)) eligible FROM sources s JOIN accounts a ON a.id=s.account_id JOIN trips t ON t.id=s.trip_id WHERE s.trip_id=? AND (?=1 OR s.approved=1 OR s.user_id=?)',
          tripId,
          Number(t.role === 'owner'),
          user?.id || '',
        );
  const importStatus = {
    sourceCount: sourceRows.length,
    syncing: sourceRows.some(
      (s) =>
        s.approved && s.disk_enabled && s.eligible && s.lock_until > Date.now(),
    ),
    waiting: sourceRows.some(
      (s) =>
        s.approved && s.disk_enabled && s.eligible && !s.last_sync && !s.error,
    ),
    failed: sourceRows.some((s) => s.approved && !!s.error),
    pendingApproval:
      sourceRows.length > 0 && sourceRows.every((s) => !s.approved),
    disconnected:
      sourceRows.length > 0 && sourceRows.every((s) => !s.disk_enabled),
    lastSync: Math.max(0, ...sourceRows.map((s) => s.last_sync || 0)),
  };
  return {
    ...(t.role === 'guest' ? {} : { importStatus }),
    trip: {
      id: t.id,
      title: t.title,
      destination: t.destination,
      start: t.start,
      end: t.end,
      description: t.description,
      descriptionMentions: descriptionMentions(t.id, t.description),
      role: t.role,
      from: t.from,
      to: t.to,
      sharing: !!t.share_hash,
    },
    media,
    notes: all(
      'SELECT n.*,(length(n.text)=0) deleted,u.name author FROM notes n JOIN users u ON u.id=n.user_id WHERE trip_id=? AND day>=? AND day<=? ORDER BY day',
      tripId,
      t.from,
      t.to,
    ),
    noteReplies: all(
      'SELECT r.id,r.note_id,r.parent_id,r.user_id,r.text,r.created,r.deleted,u.name author FROM note_replies r JOIN notes n ON n.id=r.note_id JOIN users u ON u.id=r.user_id WHERE n.trip_id=? AND n.day>=? AND n.day<=? ORDER BY r.created,r.rowid',
      tripId,
      t.from,
      t.to,
    ),
    places: all(
      'SELECT p.*,m.lat photo_lat,m.lon photo_lon FROM confirmed_places p JOIN media m ON m.id=p.media_id JOIN sources s ON s.id=m.source_id WHERE p.trip_id=? AND substr(m.taken,1,10)>=? AND substr(m.taken,1,10)<=? AND m.hidden=0 AND m.missing=0 AND s.approved=1 ORDER BY p.rowid',
      tripId,
      t.from,
      t.to,
    ),
  };
}
