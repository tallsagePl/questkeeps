import { oauthErrorReason, oauthReturnPath } from '../oauth-errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, one, run, id, token, hash, encrypt } from '../db';
import { fail, currentUser, session, cookie } from '../access';
import { appURL } from './http';

export function oauthFailure(
  reason: string,
  intent = 'login',
  returnPath = '/',
) {
  const url = new URL('/auth/error', appURL());
  url.searchParams.set('reason', oauthErrorReason(reason));
  url.searchParams.set('intent', intent === 'link' ? 'link' : 'login');
  url.searchParams.set('returnTo', oauthReturnPath(returnPath));
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
    const intent =
      req.nextUrl.searchParams.get('intent') === 'link' ? 'link' : 'login';
    if (intent === 'link' && !user) fail(401, 'messages.signInFirst');
    const requestedReturn = req.nextUrl.searchParams.get('returnTo') || '/';
    const returnTo =
      /^\/(?:join\/[A-Za-z0-9_-]+|\?(?:trip=[A-Za-z0-9_-]+|create=1))?$/.test(
        requestedReturn,
      )
        ? requestedReturn
        : '/';
    const state = token();
    const browser = token();
    const verifier = token();
    run('DELETE FROM oauth_states WHERE expires<?', Date.now());
    run(
      'INSERT INTO oauth_states (hash,browser_hash,user_id,intent,verifier,expires,return_path) VALUES (?,?,?,?,?,?,?)',
      hash(state),
      hash(browser),
      intent === 'link' ? user!.id : null,
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
      scope:
        intent === 'link'
          ? 'login:info login:email cloud_api:disk.read'
          : 'login:info login:email',
      ...(intent === 'link' ? { optional_scope: 'login:avatar' } : {}),
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
    const state = req.nextUrl.searchParams.get('state') || '';
    const s = one(
      'SELECT * FROM oauth_states WHERE hash=? AND expires>?',
      hash(state),
      Date.now(),
    );
    if (!s || s.browser_hash !== hash(cookie(req, 'ta_oauth')))
      fail(400, 'messages.authorizationExpiredPleaseSignInAgain');
    run('DELETE FROM oauth_states WHERE hash=?', hash(state));
    if (s.intent === 'link' && currentUser(req)?.id !== s.user_id)
      fail(403, 'messages.theSignedInAccountHasChanged');
    if (req.nextUrl.searchParams.has('error'))
      return oauthFailure(
        req.nextUrl.searchParams.get('error') || 'unknown',
        s.intent,
        s.return_path,
      );
    const code =
      req.nextUrl.searchParams.get('code') ||
      fail(400, 'messages.authorizationCodeIsMissing');
    const result = await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.YANDEX_CLIENT_ID!,
        client_secret: process.env.YANDEX_CLIENT_SECRET || '',
        code_verifier: s.verifier,
        redirect_uri: appURL() + '/api/auth/callback',
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!result.ok)
      return oauthFailure('exchange_failed', s.intent, s.return_path);
    const creds = await result.json();
    const profile = await fetch('https://login.yandex.ru/info?format=json', {
      headers: { Authorization: 'OAuth ' + creds.access_token },
      signal: AbortSignal.timeout(15000),
    });
    if (!profile.ok) fail(502, 'messages.couldNotReadYourYandexProfile');
    const info = await profile.json();
    if (!info.id || typeof info.login !== 'string')
      fail(502, 'errors.invalidYandexProfile');
    const providerEmail = z.email().safeParse(
      String(info.default_email || '')
        .trim()
        .toLowerCase(),
    );
    const existing = one(
      'SELECT * FROM accounts WHERE yandex_id=?',
      String(info.id),
    );
    let userId = s.user_id || existing?.user_id;
    db.transaction(() => {
      if (
        s.intent === 'link' &&
        one(
          'SELECT id FROM accounts WHERE user_id=? AND disk_enabled=1 AND yandex_id<>?',
          userId,
          String(info.id),
        )
      )
        fail(409, 'messages.disconnectYourCurrentYandexAccountInYour');
      if (s.intent === 'link' && existing && existing.user_id !== userId)
        fail(409, 'messages.thisYandexAccountIsAlreadyLinkedTo');
      if (!userId) {
        userId = id();
        const email = providerEmail.success ? providerEmail.data : null;
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
      }
      if (existing && s.intent === 'link')
        run(
          'UPDATE accounts SET token=?,refresh=?,expires=?,label=?,provider_email=?,disk_enabled=1 WHERE id=?',
          encrypt(creds.access_token),
          creds.refresh_token ? encrypt(creds.refresh_token) : existing.refresh,
          creds.expires_in ? Date.now() + creds.expires_in * 1000 : null,
          info.login,
          providerEmail.success ? providerEmail.data : null,
          existing.id,
        );
      else if (!existing)
        run(
          'INSERT INTO accounts (id,user_id,yandex_id,label,token,refresh,expires,disk_enabled,provider_email) VALUES (?,?,?,?,?,?,?,?,?)',
          id(),
          userId,
          String(info.id),
          info.login,
          encrypt(creds.access_token),
          creds.refresh_token ? encrypt(creds.refresh_token) : null,
          creds.expires_in ? Date.now() + creds.expires_in * 1000 : null,
          Number(s.intent === 'link'),
          providerEmail.success ? providerEmail.data : null,
        );
    })();
    // Login uses the already linked owner's id without replacing the Disk token
    // with a token that only grants login scopes.
    if (existing && s.intent === 'login')
      run(
        'UPDATE accounts SET provider_email=? WHERE id=?',
        providerEmail.success ? providerEmail.data : null,
        existing.id,
      );
    const response = NextResponse.redirect(
      new URL(s.return_path || '/', appURL()),
    );
    if (s.intent === 'login')
      response.cookies.set('ta_session', session(userId), {
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
  return undefined;
}
