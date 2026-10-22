import { all, one, run, db, hash } from './db';
import type { Mention } from './mentions';

export function ensureUsername(userId: string) {
  const saved = one(
    'SELECT username FROM user_handles WHERE user_id=?',
    userId,
  );
  if (saved) return saved.username as string;
  const user = one('SELECT name FROM users WHERE id=?', userId);
  if (!user) return '';
  let base = user.name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
  if (base.length < 3) base = 'user_' + hash(userId).slice(0, 8);
  return db
    .transaction(() => {
      const current = one(
        'SELECT username FROM user_handles WHERE user_id=?',
        userId,
      );
      if (current) return current.username as string;
      let username = base;
      let suffix = 1;
      while (one('SELECT 1 FROM user_handles WHERE username=?', username))
        username = base + '_' + suffix++;
      run('INSERT INTO user_handles VALUES (?,?)', userId, username);
      return username;
    })
    .immediate();
}

export function publicProfile(username: string) {
  const user = one(
    'SELECT u.id,u.name,h.username,(EXISTS(SELECT 1 FROM user_avatars WHERE user_id=u.id) OR EXISTS(SELECT 1 FROM accounts WHERE user_id=u.id AND disk_enabled=1)) hasAvatar FROM users u JOIN user_handles h ON h.user_id=u.id WHERE h.username=?',
    username,
  );
  return user
    ? {
        id: user.id as string,
        name: user.name as string,
        username: user.username as string,
        hasAvatar: !!user.hasAvatar,
      }
    : undefined;
}

export function findProfiles(query: string) {
  const q = query.replace(/^@/, '').trim().slice(0, 80);
  if (q.length < 1) return [];
  return all(
    'SELECT u.id,u.name,h.username FROM users u JOIN user_handles h ON h.user_id=u.id WHERE instr(lower(h.username),lower(?))>0 OR instr(quest_fold(u.name),quest_fold(?))>0 ORDER BY (lower(h.username)=lower(?)) DESC,h.username LIMIT 8',
    q,
    q,
    q,
  );
}

export function descriptionMentions(
  tripId: string,
  description: string,
): Mention[] {
  const explicit: Mention[] = all(
    'SELECT m.start,m.end,m.user_id userId,h.username,u.name FROM trip_description_mentions m JOIN users u ON u.id=m.user_id JOIN user_handles h ON h.user_id=u.id WHERE m.trip_id=? ORDER BY m.start',
    tripId,
  ) as Mention[];
  return resolveMentions(description, explicit);
}

export function resolveMentions(
  description: string,
  existing: Mention[],
): Mention[] {
  const explicit = [...existing];
  for (const match of description.matchAll(
    /(?<![\p{L}\p{N}_@])@([a-zA-Z0-9_]{3,30})(?![a-zA-Z0-9_])/gu,
  )) {
    const start = match.index!;
    const end = start + match[0].length;
    if (explicit.some((m) => start < m.end && end > m.start)) continue;
    const user = publicProfile(match[1]);
    if (user)
      explicit.push({
        start,
        end,
        userId: user.id,
        username: user.username,
        name: user.name,
      });
  }
  return explicit.sort((a, b) => a.start - b.start);
}
