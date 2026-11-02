import { YandexRequestError } from './yandex-request';
import { invitationRoutes } from './api/invitations';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { hash, id } from './db';
import { HttpError, fail, currentUser, requireUser } from './access';
import { queueDueSync } from './source-jobs';
import { json, appURL } from './api/http';
import { oauthFailure } from './api/oauth';
import type { RequestContext } from './api/context';
import { authRoutes } from './api/auth';
import { followRoutes } from './api/follows';
import { publicRoutes } from './api/public';
import { mediaRoutes } from './api/media';
import { friendRoutes } from './api/friends';
import { profileRoutes } from './api/profile';
import { accountRoutes } from './api/accounts';
import { tripRoutes } from './api/trips';

export async function handle(
  req: NextRequest,
  p: string[],
  background?: RequestContext['background'],
) {
  const requestId = id();
  const started = performance.now();
  const response = await dispatch(req, p, background);
  response.headers.set('X-Request-Id', requestId);
  const durationMs = Math.round(performance.now() - started);
  if (durationMs >= 2000 || response.status >= 500) {
    const group = [
      'auth',
      'trips',
      'media',
      'my-media',
      'invitations',
      'friends',
      'profile',
      'memories',
      'shares',
    ].includes(p[0])
      ? p[0]
      : 'other';
    console.warn('API diagnostic', {
      requestId,
      group,
      method: req.method,
      status: response.status,
      durationMs,
    });
  }
  return response;
}

async function dispatch(
  req: NextRequest,
  p: string[],
  background?: RequestContext['background'],
) {
  try {
    const method = req.method;
    const url = req.nextUrl;
    if (p[0] === 'cron') {
      if (method !== 'POST') fail(405, 'messages.methodNotSupported');
      const secret = process.env.CRON_SECRET;
      if (
        !secret ||
        hash(req.headers.get('authorization') || '') !==
          hash('Bearer ' + secret)
      )
        fail(401, 'messages.accessDenied');
      return json({ queued: queueDueSync() }, 202);
    }
    if (method !== 'GET' && method !== 'HEAD') {
      if (req.headers.get('origin') !== new URL(appURL()).origin)
        fail(403, 'messages.invalidRequestOrigin');
    }
    const context = { req, p, method, url, background };
    {
      const result = await authRoutes(context);
      if (result) return result;
    }
    {
      const result = await publicRoutes(context);
      if (result) return result;
    }
    {
      const result = await mediaRoutes(context);
      if (result) return result;
    }
    {
      const result = await followRoutes(context);
      if (result) return result;
    }
    const u = requireUser(req);
    {
      const result = await invitationRoutes({ ...context, u });
      if (result) return result;
    }
    {
      const result = await friendRoutes({ ...context, u });
      if (result) return result;
    }
    {
      const result = await profileRoutes({ ...context, u });
      if (result) return result;
    }
    {
      const result = await accountRoutes({ ...context, u });
      if (result) return result;
    }
    {
      const result = await tripRoutes({ ...context, u });
      if (result) return result;
    }
    fail(404, 'messages.routeNotFound');
  } catch (error) {
    if (p[0] === 'auth' && p[1] === 'callback') {
      const reasons: Record<string, string> = {
        'messages.authorizationExpiredPleaseSignInAgain': 'session_expired',
        'errors.linkExistingAccount': 'account_link_required',
        'messages.disconnectYourCurrentYandexAccountInYour':
          'account_already_linked',
      };
      const reason =
        error instanceof HttpError
          ? reasons[error.translation?.key || ''] || 'unknown'
          : 'unknown';
      return oauthFailure(reason, currentUser(req) ? 'link' : 'login');
    }
    if (req.signal.aborted && req.signal.reason?.name !== 'TimeoutError')
      return new Response(null, { status: 499 });
    if (error instanceof Error && error.name === 'TimeoutError')
      return json({ error: 'errors.requestTimedOut' }, 504);
    if (error instanceof YandexRequestError)
      return json(
        {
          error:
            error.reason === 'timeout'
              ? 'errors.requestTimedOut'
              : 'errors.yandexConnectionFailed',
        },
        error.reason === 'timeout' ? 504 : 502,
      );
    if (
      error &&
      typeof error === 'object' &&
      ['SQLITE_BUSY', 'SQLITE_LOCKED'].includes(
        String((error as { code?: unknown }).code),
      )
    ) {
      const response = json({ error: 'errors.databaseBusy' }, 503);
      response.headers.set('Retry-After', '1');
      return response;
    }
    if (error instanceof z.ZodError)
      return json(
        {
          error: 'messages.checkTheFormFields',
          fieldErrors: Object.fromEntries(
            error.issues.map((issue) => [
              String(issue.path[0] || 'end'),
              issue.message,
            ]),
          ),
        },
        400,
      );
    if (error instanceof HttpError)
      return json(
        {
          error: error.message,
          errorTranslation: error.translation,
          fieldErrors:
            p[0] === 'auth' && p[1] === 'login' && error.status === 401
              ? {
                  email: 'messages.checkYourEmailOrUsername',
                  password: 'auth.invalidCredentials',
                }
              : p[0] === 'auth' && p[1] === 'register' && error.status === 409
                ? { email: error.translation || error.message }
                : {},
        },
        error.status,
      );
    if (error instanceof Error && error.message.includes('UNIQUE constraint'))
      return json({ error: 'messages.thisRecordAlreadyExists' }, 409);
    console.error(
      'API error:',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return json({ error: 'messages.theActionCouldNotBeCompletedPlease' }, 500);
  }
}
