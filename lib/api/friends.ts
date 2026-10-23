import {
  friendLinkStatus,
  createFriendLink,
  revokeFriendLink,
  acceptFriendLink,
  pendingFriendCookie,
} from '../friend-links';
import {
  friendLists,
  relationship,
  requestFriend,
  acceptFriend,
  removeFriend,
} from '../friends';
import { findProfiles } from '../profiles';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { one } from '../db';
import { HttpError, fail, cookie, throttle } from '../access';
import { json, body, appURL } from './http';
import type { AuthenticatedContext } from './context';

export async function friendRoutes({
  req,
  p,
  method,
  url,
  u,
}: AuthenticatedContext): Promise<Response | undefined> {
  if (p[0] === 'friends' && p[1] === 'link') {
    if (!p[2]) {
      if (method === 'GET') return json(friendLinkStatus(u.id));
      if (method === 'POST') {
        throttle('friend-link-create:' + u.id, 20, 60000);
        const link = createFriendLink(u.id);
        return json({
          url: new URL('/friend/' + link.token, appURL()).href,
          expires: link.expires,
        });
      }
      if (method === 'DELETE') {
        revokeFriendLink(u.id);
        return json({ ok: true });
      }
    }
    if (p[2] === 'accept' && !p[3] && method === 'POST') {
      const value = cookie(req, pendingFriendCookie);
      if (!value) return json({ accepted: false });
      const clear = (response: NextResponse) => {
        response.cookies.set(pendingFriendCookie, '', {
          path: '/',
          maxAge: 0,
          httpOnly: true,
          sameSite: 'lax',
          secure: new URL(appURL()).protocol === 'https:',
        });
        return response;
      };
      try {
        throttle('friend-link-accept:' + u.id, 30, 60000);
        return clear(json(acceptFriendLink(u.id, value)));
      } catch (error) {
        if (error instanceof HttpError)
          return clear(json({ error: error.message }, error.status));
        throw error;
      }
    }
    fail(404, 'messages.routeNotFound');
  }
  if (p[0] === 'friends') {
    if (!p[1] && method === 'GET') return json(friendLists(u.id));
    if (p[1] && !p[2]) {
      const targetId = z.string().min(1).max(100).parse(p[1]);
      if (!one('SELECT 1 FROM users WHERE id=?', targetId))
        fail(404, 'tripDescription.userNotFound');
      if (method === 'GET')
        return json({ relationship: relationship(u.id, targetId) });
      if (method === 'POST') {
        throttle('friend-request:' + u.id, 30, 60000);
        return json({ relationship: requestFriend(u.id, targetId) });
      }
      if (method === 'PATCH') {
        z.object({ action: z.literal('accept') })
          .strict()
          .parse(await body(req));
        return json({ relationship: acceptFriend(u.id, targetId) });
      }
      if (method === 'DELETE')
        return json({ relationship: removeFriend(u.id, targetId) });
    }
    fail(404, 'messages.routeNotFound');
  }
  if (p[0] === 'profiles' && !p[1] && method === 'GET') {
    throttle('profile-search:' + u.id, 120, 60000);
    return json({ users: findProfiles(url.searchParams.get('q') || '') });
  }
}
