import { profileMediaGroups, profileMediaPage } from '../profile-media';
import { ensureUsername } from '../profiles';
import { readAvatar } from '../profile-avatar';
import { accountAvatar } from '../account-avatar';
import { z } from 'zod';
import { db, one, run, id } from '../db';
import { fail, userProfile, throttle } from '../access';
import { locationOptions } from '../location-options';
import { json, body } from './http';
import type { AuthenticatedContext } from './context';

export async function profileRoutes({
  req,
  p,
  method,
  u,
}: AuthenticatedContext): Promise<Response | undefined> {
  if (p[0] === 'locations' && method === 'GET') {
    const query = new URL(req.url).searchParams;
    return json({
      options: locationOptions(
        query.get('type') || '',
        (query.get('q') || '').slice(0, 120),
        query.get('language') === 'en' ? 'en' : 'ru',
        (query.get('countries') || '')
          .split(',')
          .filter((code) => /^[A-Z]{2}$/.test(code)),
      ),
    });
  }
  if (p[0] === 'me') {
    if (!p[1] && method === 'PATCH') {
      const input = z
        .object({
          name: z
            .string()
            .trim()
            .min(1, 'Введите имя')
            .max(80, 'Имя — не больше 80 символов')
            .optional(),
          username: z
            .string()
            .trim()
            .toLowerCase()
            .regex(
              /^[a-z0-9_]{3,30}$/,
              'Юзернейм: от 3 до 30 латинских букв, цифр или подчёркиваний',
            )
            .optional(),
        })
        .strict()
        .refine((v) => v.name !== undefined || v.username !== undefined)
        .parse(await body(req));
      ensureUsername(u.id);
      db.transaction(() => {
        if (input.username) {
          if (
            one(
              'SELECT 1 FROM user_handles WHERE username=? AND user_id<>?',
              input.username,
              u.id,
            )
          )
            fail(409, 'errors.usernameTaken');
          run(
            'UPDATE user_handles SET username=? WHERE user_id=?',
            input.username,
            u.id,
          );
        }
        if (input.name !== undefined)
          run('UPDATE users SET name=? WHERE id=?', input.name, u.id);
      }).immediate();
      return json({ user: userProfile(u.id) });
    }
    if (p[1] === 'avatar') {
      if (method === 'GET') {
        const avatar = one(
          'SELECT image FROM user_avatars WHERE user_id=?',
          u.id,
        );
        if (avatar)
          return new Response(new Uint8Array(avatar.image), {
            headers: {
              'Content-Type': 'image/webp',
              'Cache-Control': 'private, no-store',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        if (u.yandexAccountId) return accountAvatar(u.yandexAccountId);
        fail(404, 'messages.noProfilePictureUploaded');
      }
      if (method === 'PUT') {
        throttle('avatar:' + u.id, 30);
        const image = await readAvatar(req);
        run(
          'INSERT INTO user_avatars VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET image=excluded.image,version=excluded.version',
          u.id,
          image,
          id(),
        );
        return json({ user: userProfile(u.id) });
      }
      if (method === 'DELETE') {
        run('DELETE FROM user_avatars WHERE user_id=?', u.id);
        return json({ user: userProfile(u.id) });
      }
    }
  }
  if (p[0] === 'my-media' && method === 'GET') {
    if (p[1] === 'groups' && !p[2])
      return json({ groups: profileMediaGroups(u.id) });
    if (!p[1]) return json(profileMediaPage(u.id, new URL(req.url)));
  }
}
