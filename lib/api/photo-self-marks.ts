import { z } from 'zod';
import { fail, mediaFor, requireUser } from '../access';
import type { PhotoSelfMarks } from '../contracts';
import { all, db, run } from '../db';
import type { RequestContext } from './context';
import { body, json } from './http';

const markInput = z.strictObject({ marked: z.boolean() });

const photoMarks = db.transaction(
  (
    req: Request,
    mediaId: string,
    userId: string,
    marked?: boolean,
  ): PhotoSelfMarks => {
    const photo = mediaFor(req, mediaId);
    if (photo.kind !== 'photo') fail(404, 'messages.fileNotFound');
    if (marked === true)
      run(
        'INSERT INTO photo_self_marks (media_id,user_id) VALUES (?,?) ON CONFLICT(media_id,user_id) DO NOTHING',
        photo.id,
        userId,
      );
    if (marked === false)
      run(
        'DELETE FROM photo_self_marks WHERE media_id=? AND user_id=?',
        photo.id,
        userId,
      );
    const people = all<PhotoSelfMarks['people'][number]>(
      `SELECT u.id,u.name,h.username
         FROM photo_self_marks m
         JOIN users u ON u.id=m.user_id
         LEFT JOIN user_handles h ON h.user_id=u.id
        WHERE m.media_id=?
        ORDER BY quest_fold(u.name),u.id`,
      photo.id,
    );
    return {
      markedByMe: people.some((person) => person.id === userId),
      people,
    };
  },
);

export async function photoSelfMarkRoute({
  req,
  p,
  method,
  url,
}: RequestContext) {
  if (url.searchParams.has('share'))
    fail(403, 'messages.youDoNotHaveAccessToThis');
  const user = requireUser(req);
  if (method === 'PATCH') {
    const { marked } = markInput.parse(await body(req));
    return json(photoMarks.immediate(req, p[1], user.id, marked));
  }
  return json(photoMarks(req, p[1], user.id));
}
