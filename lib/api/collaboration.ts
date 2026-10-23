import { z } from 'zod';
import { guestToken } from '../guest-links';
import { publicProfile, ensureUsername } from '../profiles';
import { db, one, all, run, id, token, hash } from '../db';
import { fail, membership, owner, assertDay, throttle } from '../access';
import { disk, normalizePath } from '../yandex';
import { syncSource } from '../sync';
import { json, body, day, dates, bounds, appURL } from './http';
import type { AuthenticatedContext } from './context';

export async function collaborationRoutes(
  { req, p, method, u }: AuthenticatedContext,
  tid: string,
): Promise<Response | undefined> {
  if (p[2] === 'members') {
    const t = membership(tid, u.id);
    if (method === 'GET')
      return json({
        members: all(
          'SELECT u.id,u.name,m.start,m.end,m.active FROM members m JOIN users u ON u.id=m.user_id WHERE m.trip_id=?',
          tid,
        ).map((member) => ({
          ...member,
          ...publicProfile(ensureUsername(member.id)),
        })),
        owner: publicProfile(ensureUsername(t.owner_id)),
      });
    if (method === 'PATCH') {
      owner(tid, u.id);
      const input = z
        .object({
          userId: z.string(),
          active: z.boolean().optional(),
          start: day.optional(),
          end: day.optional(),
        })
        .parse(await body(req));
      const m =
        one(
          'SELECT * FROM members WHERE trip_id=? AND user_id=?',
          tid,
          input.userId,
        ) || fail(404, 'messages.memberNotFound');
      const range = dates.parse({
        start: input.start || m.start,
        end: input.end || m.end,
      });
      bounds(range, t);
      db.transaction(() => {
        run(
          'UPDATE members SET start=?,end=?,active=? WHERE trip_id=? AND user_id=?',
          range.start,
          range.end,
          input.active === undefined ? m.active : Number(input.active),
          tid,
          input.userId,
        );
      })();
      return json({ ok: true });
    }
  }
  if (p[2] === 'leave' && method === 'POST') {
    const t = membership(tid, u.id);
    if (t.role === 'owner')
      fail(400, 'messages.theOwnerCannotLeaveTheirOwnTrip');
    db.transaction(() => {
      run(
        'UPDATE members SET active=0 WHERE trip_id=? AND user_id=?',
        tid,
        u.id,
      );
    })();
    return json({ ok: true });
  }
  if (p[2] === 'invite' && method === 'POST') {
    const t = owner(tid, u.id);
    const input = dates.parse(await body(req));
    bounds(input, t);
    const raw = token();
    run(
      'INSERT INTO invites VALUES (?,?,?,?,?,0)',
      hash(raw),
      tid,
      input.start,
      input.end,
      Date.now() + 7 * 86400000,
    );
    return json({ url: appURL() + '/join/' + raw });
  }
  if (p[2] === 'share' && method === 'GET') {
    const trip = owner(tid, u.id);
    const raw = guestToken(trip);
    return json({ url: raw ? appURL() + '/s/' + raw : null });
  }
  if (p[2] === 'share' && method === 'POST') {
    owner(tid, u.id);
    const input = z.object({ enabled: z.boolean() }).parse(await body(req));
    const raw = input.enabled ? token() : null;
    run(
      'UPDATE trips SET share_hash=? WHERE id=?',
      raw ? hash(raw) : null,
      tid,
    );
    const shared = guestToken({ id: tid, share_hash: raw ? hash(raw) : null });
    return json({ url: shared ? appURL() + '/s/' + shared : null });
  }
  if (p[2] === 'notes') {
    const t = membership(tid, u.id);
    if (p[3] && p[4] === 'replies') {
      const note =
        one('SELECT * FROM notes WHERE id=? AND trip_id=?', p[3], tid) ||
        fail(404, 'messages.entryNotFound');
      assertDay(note.day, t);
      if (method === 'POST' && !p[5]) {
        const input = z
          .object({
            text: z.string().trim().min(1).max(3000),
            parentId: z.string().min(1).max(100).nullable().optional(),
          })
          .strict()
          .parse(await body(req));
        const replyId = id();
        db.transaction(() => {
          const currentNote =
            one('SELECT * FROM notes WHERE id=? AND trip_id=?', note.id, tid) ||
            fail(404, 'messages.entryNotFound');
          assertDay(currentNote.day, t);
          const parent = input.parentId
            ? one(
                'SELECT * FROM note_replies WHERE id=? AND note_id=?',
                input.parentId,
                note.id,
              )
            : currentNote;
          if (!parent) fail(404, 'errors.replyNotFound');
          if (parent.deleted || !parent.text) fail(400, 'errors.replyDeleted');
          if (parent.user_id === u.id) fail(400, 'errors.replyToSelf');
          throttle('note-reply:' + u.id, 30, 60000);
          run(
            'INSERT INTO note_replies(id,note_id,parent_id,user_id,text,created) VALUES (?,?,?,?,?,?)',
            replyId,
            note.id,
            input.parentId || null,
            u.id,
            input.text,
            Date.now(),
          );
        }).immediate();
        return json(
          {
            reply: one(
              'SELECT r.*,u.name author FROM note_replies r JOIN users u ON u.id=r.user_id WHERE r.id=?',
              replyId,
            ),
          },
          201,
        );
      }
      if (method === 'DELETE' && p[5] && !p[6]) {
        const reply =
          one(
            'SELECT * FROM note_replies WHERE id=? AND note_id=?',
            p[5],
            note.id,
          ) || fail(404, 'errors.replyNotFound');
        if (reply.user_id !== u.id) fail(403, 'errors.deleteOwnReplies');
        run("UPDATE note_replies SET text='',deleted=1 WHERE id=?", reply.id);
        return json({ ok: true });
      }
    }
    if (method === 'POST' && !p[3]) {
      const input = z
        .object({ day, text: z.string().trim().min(1).max(5000) })
        .parse(await body(req));
      assertDay(input.day, t);
      run(
        'INSERT INTO notes VALUES (?,?,?,?,?)',
        id(),
        tid,
        u.id,
        input.day,
        input.text,
      );
      return json({ ok: true }, 201);
    }
    if (method === 'DELETE' && p[3] && !p[4]) {
      const n =
        one('SELECT * FROM notes WHERE id=? AND trip_id=?', p[3], tid) ||
        fail(404, 'messages.entryNotFound');
      assertDay(n.day, t);
      if (n.user_id !== u.id)
        fail(403, 'messages.youCanOnlyDeleteYourOwnEntries');
      db.transaction(() => {
        // Keep other participants' replies when the author removes the original text.
        if (one('SELECT id FROM note_replies WHERE note_id=? LIMIT 1', n.id))
          run("UPDATE notes SET text='' WHERE id=?", n.id);
        else run('DELETE FROM notes WHERE id=?', n.id);
      }).immediate();
      return json({ ok: true });
    }
  }
  if (p[2] === 'sources') {
    const t = membership(tid, u.id);
    if (method === 'GET')
      return json({
        sources: all(
          'SELECT s.id,s.path,s.user_id,s.approved,s.last_sync,s.error,s.lock_until,a.label,u.name author FROM sources s JOIN accounts a ON a.id=s.account_id JOIN users u ON u.id=s.user_id WHERE s.trip_id=? AND (?=1 OR s.user_id=?)',
          tid,
          Number(t.role === 'owner'),
          u.id,
        ),
      });
    if (!p[3] && method === 'POST') {
      const input = z
        .object({ accountId: z.string(), path: z.string().max(4096) })
        .parse(await body(req));
      if (
        !one(
          'SELECT id FROM accounts WHERE id=? AND user_id=?',
          input.accountId,
          u.id,
        )
      )
        fail(403, 'messages.thisAccountBelongsToSomeoneElse');
      const folder = normalizePath(input.path);
      if (folder === 'disk:/') fail(400, 'messages.chooseAFolderForThisTrip');
      const meta = await disk(input.accountId, 'resources', {
        path: folder,
        limit: '0',
      });
      if (meta.type !== 'dir') fail(400, 'messages.chooseAFolder');
      const sid = id();
      run(
        'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,?)',
        sid,
        tid,
        u.id,
        input.accountId,
        folder,
        Number(t.role === 'owner'),
      );
      return json({ id: sid, approved: t.role === 'owner' }, 201);
    }
    if (p[3]) {
      const s =
        one('SELECT * FROM sources WHERE id=? AND trip_id=?', p[3], tid) ||
        fail(404, 'messages.sourceNotFound');
      if (method === 'PATCH') {
        owner(tid, u.id);
        const input = z
          .object({ approved: z.boolean() })
          .parse(await body(req));
        run(
          'UPDATE sources SET approved=? WHERE id=?',
          Number(input.approved),
          s.id,
        );
        return json({ ok: true });
      }
      if (method === 'DELETE') {
        if (s.user_id !== u.id && t.role !== 'owner')
          fail(403, 'messages.accessDenied');
        run('UPDATE sources SET approved=0 WHERE id=?', s.id);
        return json({ ok: true });
      }
      if (method === 'POST' && p[4] === 'sync') {
        if (t.role !== 'owner' && s.user_id !== u.id)
          fail(403, 'messages.accessDenied');
        throttle('sync:' + s.id, 10);
        return json(await syncSource(s.id));
      }
    }
  }
}
