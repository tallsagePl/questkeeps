import { accountAvatar } from '../account-avatar';
import { one, all, run } from '../db';
import { fail, userProfile } from '../access';
import { disk, normalizePath, Resource } from '../yandex';
import { json } from './http';
import type { AuthenticatedContext } from './context';

export async function accountRoutes({
  p,
  method,
  url,
  u,
}: AuthenticatedContext): Promise<Response | undefined> {
  if (p[0] === 'accounts') {
    if (p[1] && !p[2] && method === 'DELETE') {
      const account =
        one(
          'SELECT id FROM accounts WHERE id=? AND user_id=? AND disk_enabled=1',
          p[1],
          u.id,
        ) || fail(403, 'messages.accessDenied');
      run(
        "UPDATE accounts SET token='',refresh=NULL,expires=NULL,disk_enabled=0 WHERE id=?",
        account.id,
      );
      return json({ user: userProfile(u.id) });
    }
    if (p[1] && p[2] === 'avatar' && method === 'GET') {
      if (
        !one(
          'SELECT id FROM accounts WHERE id=? AND user_id=? AND disk_enabled=1',
          p[1],
          u.id,
        )
      )
        fail(403, 'messages.accessDenied');
      return accountAvatar(p[1]);
    }
    if (method === 'GET' && !p[1])
      return json({
        accounts: all(
          'SELECT id,label FROM accounts WHERE user_id=? AND disk_enabled=1',
          u.id,
        ),
      });
    if (p[1] && p[2] === 'folders' && method === 'GET') {
      if (
        !one(
          'SELECT id FROM accounts WHERE id=? AND user_id=? AND disk_enabled=1',
          p[1],
          u.id,
        )
      )
        fail(403, 'messages.accessDenied');
      const folder = normalizePath(url.searchParams.get('path') || 'disk:/');
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const r = (await disk(p[1], 'resources', {
        path: folder,
        limit: '100',
        offset: String(offset),
        sort: 'name',
      })) as Resource;
      return json({
        path: folder,
        folders:
          r._embedded?.items
            .filter((x) => x.type === 'dir')
            .map((x) => ({ name: x.name, path: x.path })) || [],
        nextOffset:
          r._embedded && offset + 100 < r._embedded.total ? offset + 100 : null,
      });
    }
  }
}
