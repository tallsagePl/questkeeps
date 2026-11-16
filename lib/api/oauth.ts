import { queueTelegramRegistration } from '../telegram';
import {
  oauthErrorReason,
  oauthIntent,
  oauthReturnPath,
  type OAuthErrorReason,
  type OAuthIntent,
} from '../oauth-errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, one, run, id, token, hash, encrypt } from '../db';
import { fail, currentUser, session, cookie, HttpError } from '../access';
import { appURL } from './http';
import { createTripDiskEntry, oauthRegistrationHash } from '../trip-entry';
import { YandexRequestError, yandexGet } from '../yandex-request';
import { boundedProviderJson } from '../provider-queue';
import { queueProfileCompletionNotice } from '../notifications';

const callbackErrors: Record<string, OAuthErrorReason> = {
  'messages.authorizationExpiredPleaseSignInAgain': 'session_expired',
  'messages.authorizationCodeIsMissing': 'session_expired',
  'messages.theSignedInAccountHasChanged': 'link_session_changed',
  'errors.linkExistingAccount': 'account_link_required',
  'messages.disconnectYourCurrentYandexAccountInYour': 'account_already_linked',
  'messages.thisYandexAccountIsAlreadyLinkedTo': 'account_linked_elsewhere',
};

class OAuthProviderError extends Error {
  constructor(
    readonly reason:
      'provider_unavailable' | 'exchange_failed' | 'profile_failed',
    readonly stage: 'token' | 'profile',
    readonly status?: number,
  ) {
    super(reason);
  }
}

const tokenResponse = z.object({
  access_token: z.string().trim().min(1),
  refresh_token: z.string().nullish(),
  expires_in: z.number().positive().nullish(),
  scope: z.string().optional(),
});

const profileResponse = z.object({
  id: z.union([z.string().min(1), z.number().int().positive()]),
  login: z.string().trim().min(1),
  display_name: z.string().nullish(),
  default_email: z.string().nullish(),
});

type OAuthState = {
  browser_hash: string;
  user_id: string | null;
  intent: OAuthIntent;
  verifier: string;
  return_path: string | null;
};

const diskReadScope = 'cloud_api:disk.read';

export function oauthCallbackFailure(
  error: unknown,
  intent: OAuthIntent,
  returnPath = '/',
) {
  if (error instanceof OAuthProviderError) {
    console.warn('Yandex OAuth request failed', {
      intent,
      stage: error.stage,
      reason: error.reason,
      status: error.status,
    });
    return oauthFailure(error.reason, intent, returnPath);
  }
  const reason =
    error instanceof HttpError
      ? callbackErrors[error.translation?.key || ''] || 'unknown'
      : 'unknown';
  if (reason === 'unknown')
    console.warn('Yandex OAuth callback failed', { intent });
  return oauthFailure(reason, intent, returnPath);
}

export function oauthFailure(
  reason: string,
  intent: OAuthIntent = 'login',
  returnPath = '/',
) {
  const url = new URL('/auth/error', appURL());
  url.searchParams.set('reason', oauthErrorReason(reason));
  url.searchParams.set('intent', intent);
  url.searchParams.set(
    'returnTo',
    intent === 'login_disk' ? createTripDiskEntry : oauthReturnPath(returnPath),
  );
  const response = NextResponse.redirect(url);
  response.cookies.set('ta_oauth', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: appURL().startsWith('https:'),
    path: '/api/auth',
    maxAge: 0,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function oauth(req: NextRequest, p: string[]) {
  if (!process.env.YANDEX_CLIENT_ID)
    fail(503, 'messages.setYandexClientIdAndYandexClient');
  if (p[1] === 'yandex') {
    const user = currentUser(req);
    const intent = oauthIntent(req.nextUrl.searchParams.get('intent'));
    if (intent === 'link' && !user) fail(401, 'messages.signInFirst');
    const connectsDisk = intent !== 'login';
    const returnTo =
      intent === 'login_disk'
        ? createTripDiskEntry
        : oauthReturnPath(req.nextUrl.searchParams.get('returnTo') || '/');
    const state = token();
    const browser = token();
    const verifier = token();
    run('DELETE FROM oauth_states WHERE expires<?', Date.now());
    run(
      'INSERT INTO oauth_states (hash,browser_hash,user_id,intent,verifier,expires,return_path) VALUES (?,?,?,?,?,?,?)',
      hash(state),
      hash(browser),
      connectsDisk ? (user?.id ?? null) : null,
      intent,
      verifier,
      Date.now() + 600000,
      returnTo,
    );
    const url = new URL('https://oauth.yandex.ru/authorize');
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.YANDEX_CLIENT_ID!,
      redirect_uri: appURL() + '/api/auth/callback',
      scope: connectsDisk
        ? 'login:info login:email ' + diskReadScope
        : 'login:info login:email',
      ...(connectsDisk ? { optional_scope: 'login:avatar' } : {}),
      state,
      code_challenge: Buffer.from(hash(verifier), 'hex').toString('base64url'),
      code_challenge_method: 'S256',
      force_confirm: 'yes',
    }).toString();
    const response = NextResponse.redirect(url);
    response.cookies.set('ta_oauth', browser, {
      httpOnly: true,
      sameSite: 'lax',
      secure: appURL().startsWith('https:'),
      maxAge: 600,
      path: '/api/auth',
    });
    return response;
  }
  if (p[1] === 'callback') {
    const stateHash = hash(req.nextUrl.searchParams.get('state') || '');
    const s = one<OAuthState>(
      'SELECT * FROM oauth_states WHERE hash=?',
      stateHash,
    );
    if (!s || s.browser_hash !== hash(cookie(req, 'ta_oauth'))) {
      if (s?.intent === 'login_disk')
        return oauthFailure('session_expired', s.intent);
      fail(400, 'messages.authorizationExpiredPleaseSignInAgain');
    }
    if (
      !run(
        'DELETE FROM oauth_states WHERE hash=? AND browser_hash=? AND expires>?',
        stateHash,
        s.browser_hash,
        Date.now(),
      ).changes
    )
      return oauthFailure('session_expired', s.intent, s.return_path || '/');
    return finishOAuth(req, s).catch((error: unknown) =>
      oauthCallbackFailure(error, s.intent, s.return_path || '/'),
    );
  }
  return undefined;
}

async function finishOAuth(req: NextRequest, s: OAuthState) {
  const connectsDisk = s.intent !== 'login';
  const startsSession = s.intent !== 'link' && !s.user_id;
  const assertSameUser = () => {
    if (connectsDisk && (currentUser(req)?.id ?? null) !== s.user_id)
      fail(403, 'messages.theSignedInAccountHasChanged');
  };
  assertSameUser();
  if (req.nextUrl.searchParams.has('error'))
    return oauthFailure(
      req.nextUrl.searchParams.get('error') || 'unknown',
      s.intent,
      s.return_path || '/',
    );
  const code =
    req.nextUrl.searchParams.get('code') ||
    fail(400, 'messages.authorizationCodeIsMissing');
  const creds = await exchangeCode(code, s.verifier);
  if (
    connectsDisk &&
    creds.scope !== undefined &&
    !creds.scope.split(/\s+/).includes(diskReadScope)
  )
    return oauthFailure('invalid_scope', s.intent, s.return_path || '/');
  const info = await fetchProfile(creds.access_token);
  const providerEmail = z.email().safeParse(
    String(info.default_email || '')
      .trim()
      .toLowerCase(),
  );
  const providerId = String(info.id);
  const email = providerEmail.success ? providerEmail.data : null;
  const { sessionToken, created } = db
    .transaction(() => {
      // The identity or its links can change while requests to Yandex are in flight.
      assertSameUser();
      const existing = one<{
        id: string;
        user_id: string;
        refresh: string | null;
      }>(
        'SELECT id,user_id,refresh FROM accounts WHERE yandex_id=?',
        providerId,
      );
      let userId = s.user_id || existing?.user_id;
      let created = false;
      if (s.user_id && existing && existing.user_id !== s.user_id)
        fail(409, 'messages.thisYandexAccountIsAlreadyLinkedTo');
      if (
        connectsDisk &&
        userId &&
        one(
          'SELECT id FROM accounts WHERE user_id=? AND disk_enabled=1 AND yandex_id<>?',
          userId,
          providerId,
        )
      )
        fail(409, 'messages.disconnectYourCurrentYandexAccountInYour');
      if (!userId) {
        userId = id();
        if (email && one('SELECT id FROM users WHERE email=?', email))
          fail(409, 'errors.linkExistingAccount');
        run(
          'INSERT INTO users VALUES (?,?,?,?,?)',
          userId,
          email,
          info.display_name || info.login || 'Путешественник',
          null,
          Date.now(),
        );
        queueTelegramRegistration(userId);
        if (s.intent === 'login_disk') queueProfileCompletionNotice(userId);
        created = true;
      }
      if (existing && connectsDisk) {
        run(
          'UPDATE accounts SET token=?,refresh=?,expires=?,label=?,provider_email=?,disk_enabled=1 WHERE id=?',
          encrypt(creds.access_token),
          creds.refresh_token ? encrypt(creds.refresh_token) : existing.refresh,
          creds.expires_in ? Date.now() + creds.expires_in * 1000 : null,
          info.login,
          email,
          existing.id,
        );
      } else if (!existing) {
        run(
          'INSERT INTO accounts (id,user_id,yandex_id,label,token,refresh,expires,disk_enabled,provider_email) VALUES (?,?,?,?,?,?,?,?,?)',
          id(),
          userId,
          providerId,
          info.login,
          encrypt(creds.access_token),
          creds.refresh_token ? encrypt(creds.refresh_token) : null,
          creds.expires_in ? Date.now() + creds.expires_in * 1000 : null,
          Number(connectsDisk),
          email,
        );
      } else {
        // Normal login should leave any Disk token already in use alone.
        run(
          'UPDATE accounts SET provider_email=? WHERE id=?',
          email,
          existing.id,
        );
      }
      return { sessionToken: startsSession ? session(userId) : null, created };
    })
    .immediate();
  const destination = new URL(s.return_path || '/', appURL());
  if (created) destination.hash = oauthRegistrationHash;
  const response = NextResponse.redirect(destination);
  if (sessionToken)
    response.cookies.set('ta_session', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: appURL().startsWith('https:'),
      path: '/',
      maxAge: 30 * 86400,
    });
  // Use one cookie API: mixing a raw Set-Cookie header and cookies.delete
  // caused NextResponse to overwrite the newly issued login session.
  response.cookies.set('ta_oauth', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: appURL().startsWith('https:'),
    path: '/api/auth',
    maxAge: 0,
  });
  return response;
}

async function exchangeCode(code: string, verifier: string) {
  const signal = AbortSignal.timeout(20000);
  let response: Response;
  try {
    // The authorization code is single-use. The server may have consumed it
    // even when no response reached us.
    response = await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      redirect: 'manual',
      cache: 'no-store',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.YANDEX_CLIENT_ID!,
        client_secret: process.env.YANDEX_CLIENT_SECRET || '',
        code_verifier: verifier,
        redirect_uri: appURL() + '/api/auth/callback',
      }),
      signal,
    });
  } catch {
    throw new OAuthProviderError('provider_unavailable', 'token');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    const unavailable =
      response.status >= 500 || [408, 429].includes(response.status);
    throw new OAuthProviderError(
      unavailable ? 'provider_unavailable' : 'exchange_failed',
      'token',
      response.status,
    );
  }
  try {
    return tokenResponse.parse(
      await boundedProviderJson(response, signal, 65536),
    );
  } catch {
    throw new OAuthProviderError(
      signal.aborted ? 'provider_unavailable' : 'exchange_failed',
      'token',
      response.status,
    );
  }
}

async function fetchProfile(token: string) {
  const signal = AbortSignal.timeout(15000);
  try {
    return await yandexGet(
      'https://login.yandex.ru/info?format=json',
      {
        headers: { Authorization: 'OAuth ' + token },
        cache: 'no-store',
        signal,
      },
      'oauth-profile',
      async (response, active) => {
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          throw new OAuthProviderError(
            'profile_failed',
            'profile',
            response.status,
          );
        }
        return profileResponse.parse(
          await boundedProviderJson(response, active, 65536),
        );
      },
      { attemptMs: 7000 },
    );
  } catch (error) {
    if (error instanceof OAuthProviderError) throw error;
    if (
      error instanceof YandexRequestError ||
      signal.aborted ||
      error instanceof TypeError
    )
      throw new OAuthProviderError(
        'provider_unavailable',
        'profile',
        error instanceof YandexRequestError ? error.upstreamStatus : undefined,
      );
    throw new OAuthProviderError('profile_failed', 'profile');
  }
}
