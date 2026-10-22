import {
  friendLinkStatus,
  createFriendLink,
  revokeFriendLink,
  acceptFriendLink,
  pendingFriendCookie,
} from './friend-links';
import {
  verificationRequired,
  mailConfigured,
  emailPending,
  queueVerification,
  confirmEmail,
} from './email-verification';
import {
  validRegistrationPassword,
  registrationPasswordHint,
} from './password-policy';
import {
  ownProfileMedia,
  profileMediaGroups,
  profileMediaPage,
  sharedProfileTrips,
} from './profile-media';
import {
  friendLists,
  relationship,
  requestFriend,
  acceptFriend,
  removeFriend,
} from './friends';
import { localizedWikiArticle } from './wiki-article';
import {
  ensureUsername,
  publicProfile,
  findProfiles,
  descriptionMentions,
  resolveMentions,
} from './profiles';
import { areaWiki } from './map-area-wiki';
import {
  areaSuggestions,
  addAreaToPhotos,
  osmAreaId,
} from './map-area-suggestions';
import { readAvatar } from './profile-avatar';
import { accountAvatar } from './account-avatar';
import { oauthErrorReason, oauthReturnPath } from './oauth-errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hash as passwordHash, compare } from 'bcryptjs';
import { db, one, all, run, id, token, hash, encrypt, Row } from './db';
import {
  HttpError,
  fail,
  currentUser,
  userProfile,
  requireUser,
  session,
  sessionCookie,
  cookie,
  membership,
  owner,
  viewAccess,
  tripData,
  assertDay,
  mediaFor,
  throttle,
} from './access';
import { disk, normalizePath, fetchMedia, Resource } from './yandex';
import { syncSource, syncDue } from './sync';
import { inferTrip, ownFolder } from './infer-trip';
import { nearby, placeSummary, placeImage, placeText } from './places';
import { placeTextContent } from './place-text';
import { locationOptions } from './location-options';
import { placeGeometry } from './place-geometry';
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    'Некорректная дата',
  );
const dates = z
  .object({ start: day, end: day })
  .refine((v) => v.start <= v.end, 'Дата окончания раньше начала');
const appURL = () => process.env.APP_URL || 'http://localhost:3000';
function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
async function body(req: Request): Promise<any> {
  const reader = req.body?.getReader();
  if (!reader) fail(400, 'Пустой запрос');
  const chunks = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 65536) {
      await reader.cancel();
      fail(413, 'Слишком большой запрос');
    }
    chunks.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    fail(400, 'Некорректный JSON');
  }
}
function bounds(input: { start: string; end: string }, trip: Row) {
  if (input.start < trip.start || input.end > trip.end)
    fail(400, 'Период участия должен быть внутри поездки');
}
function oauthFailure(reason: string, intent = 'login', returnPath = '/') {
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
async function oauth(req: NextRequest, p: string[]) {
  if (!process.env.YANDEX_CLIENT_ID)
    fail(503, 'Добавьте YANDEX_CLIENT_ID и YANDEX_CLIENT_SECRET в .env.local');
  if (p[1] === 'yandex') {
    const user = currentUser(req);
    const intent =
      req.nextUrl.searchParams.get('intent') === 'link' ? 'link' : 'login';
    if (intent === 'link' && !user) fail(401, 'Сначала войдите');
    const requestedReturn = req.nextUrl.searchParams.get('returnTo') || '/';
    const returnTo =
      /^\/(?:join\/[A-Za-z0-9_-]+|\?(?:trip=[A-Za-z0-9_-]+|create=1))?$/.test(
        requestedReturn,
      )
        ? requestedReturn
        : '/';
    const state = token(),
      browser = token(),
      verifier = token();
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
      fail(400, 'Авторизация истекла. Повторите вход');
    run('DELETE FROM oauth_states WHERE hash=?', hash(state));
    if (s.intent === 'link' && currentUser(req)?.id !== s.user_id)
      fail(403, 'Аккаунт входа изменился');
    if (req.nextUrl.searchParams.has('error'))
      return oauthFailure(
        req.nextUrl.searchParams.get('error') || 'unknown',
        s.intent,
        s.return_path,
      );
    const code =
      req.nextUrl.searchParams.get('code') || fail(400, 'Нет кода авторизации');
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
    if (!profile.ok) fail(502, 'Не удалось прочитать профиль Яндекса');
    const info = await profile.json();
    if (!info.id || typeof info.login !== 'string')
      fail(502, 'Некорректный профиль Яндекса');
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
        fail(409, 'Сначала отключите текущий аккаунт Яндекса в профиле');
      if (s.intent === 'link' && existing && existing.user_id !== userId)
        fail(409, 'Этот Яндекс уже подключён к другому пользователю');
      if (!userId) {
        userId = id();
        const email = providerEmail.success ? providerEmail.data : null;
        if (email && one('SELECT id FROM users WHERE email=?', email))
          fail(409, 'Войдите в существующий профиль и подключите Яндекс');
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
export async function handle(
  req: NextRequest,
  p: string[],
  background?: (task: () => Promise<void>) => void,
) {
  try {
    const method = req.method;
    const url = req.nextUrl;
    if (p[0] === 'cron') {
      if (method !== 'POST') fail(405, 'Метод не поддерживается');
      const secret = process.env.CRON_SECRET;
      if (
        !secret ||
        hash(req.headers.get('authorization') || '') !==
          hash('Bearer ' + secret)
      )
        fail(401, 'Нет доступа');
      return json(await syncDue());
    }
    if (method !== 'GET' && method !== 'HEAD') {
      if (req.headers.get('origin') !== new URL(appURL()).origin)
        fail(403, 'Неверный источник запроса');
    }
    if (p[0] === 'auth' && method === 'GET') {
      const result = await oauth(req, p);
      if (result) return result;
    }
    if (p[0] === 'auth' && method === 'POST') {
      if (p[1] === 'verify-email') {
        const input = z
          .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
          .parse(await body(req));
        throttle('email:verify:' + hash(input.token), 6);
        if (!confirmEmail(input.token))
          fail(400, 'Ссылка подтверждения недействительна или истекла');
        return json({ verified: true });
      }
      if (p[1] === 'resend-verification') {
        const input = z
          .object({ email: z.email().max(254) })
          .parse(await body(req));
        const email = input.email.toLowerCase();
        throttle('email:resend:' + hash(email), 3, 3600000);
        const user = one('SELECT id FROM users WHERE email=?', email);
        if (user && emailPending(user.id) && mailConfigured())
          queueVerification(user.id, email);
        return json({
          message: 'Если почта ожидает подтверждения, мы отправим письмо.',
        });
      }

      if (p[1] === 'logout') {
        run(
          'DELETE FROM sessions WHERE hash=?',
          hash(cookie(req, 'ta_session')),
        );
        const r = json({ ok: true });
        r.headers.set('Set-Cookie', sessionCookie('', 0));
        return r;
      }
      if (p[1] === 'register' || p[1] === 'login') {
        const registering = p[1] === 'register';
        const emailAddress = z
          .string()
          .trim()
          .toLowerCase()
          .pipe(z.email().max(254));
        const loginIdentity = z
          .string()
          .trim()
          .toLowerCase()
          .max(254)
          .refine(
            (value) =>
              z.email().safeParse(value).success ||
              /^@?[a-z0-9_]{3,30}$/.test(value),
            'Введите email или уникальный никнейм',
          );
        const input = z
          .object({
            email: registering ? emailAddress : loginIdentity,
            password: z.string().min(1, 'Введите пароль').max(128),
            passwordConfirmation: z.string().max(128).optional(),
            name: z.string().trim().min(1).max(80).optional(),
          })
          .parse(await body(req));
        if (
          registering &&
          input.passwordConfirmation !== undefined &&
          input.passwordConfirmation !== input.password
        )
          return json(
            {
              error: 'Пароли не совпадают',
              fieldErrors: { passwordConfirmation: 'Пароли не совпадают' },
            },
            400,
          );
        if (registering && !validRegistrationPassword(input.password))
          return json(
            {
              error: registrationPasswordHint,
              fieldErrors: { password: registrationPasswordHint },
            },
            400,
          );
        const byEmail = z.email().safeParse(input.email).success;
        const identity = byEmail ? input.email : input.email.replace(/^@/, '');
        throttle('auth:identity:' + hash(identity), 10);
        let u =
          registering || byEmail
            ? one('SELECT * FROM users WHERE email=?', input.email)
            : one(
                'SELECT u.* FROM users u JOIN user_handles h ON h.user_id=u.id WHERE h.username=?',
                identity,
              );
        // Email, @handle and handle share one account budget, including renamed handles.
        if (!registering && u) throttle('auth:account:' + u.id, 10);
        if (p[1] === 'register') {
          if (u) fail(409, 'Этот email уже зарегистрирован');
          if (verificationRequired() && !mailConfigured())
            fail(503, 'Регистрация временно недоступна: почта не подключена');
          const userId = id();
          const encodedPassword = await passwordHash(input.password, 12);
          db.transaction(() => {
            run(
              'INSERT INTO users VALUES (?,?,?,?,?)',
              userId,
              input.email,
              input.name || input.email.split('@')[0],
              encodedPassword,
              Date.now(),
            );
            run(
              'INSERT INTO email_status (user_id,required) VALUES (?,?)',
              userId,
              Number(verificationRequired()),
            );
            if (verificationRequired()) queueVerification(userId, input.email);
          }).immediate();
          u = one('SELECT * FROM users WHERE id=?', userId);
        } else {
          const valid = await compare(
            input.password,
            u?.password ||
              '$2b$12$u4KaOyrGniR5wMopNUZs7eKXiaP6cCcu8KMxD5N0p6d45EswI1/sG',
          );
          if (!u || !u.password || !valid)
            fail(401, 'Неверный email, никнейм или пароль');
        }
        if (emailPending(u!.id))
          return json({
            verificationRequired: true,
            verificationEmail: u!.email,
            message: 'Подтверди email по ссылке из письма.',
          });
        const r = json({ user: userProfile(u!.id) });
        r.headers.set('Set-Cookie', sessionCookie(session(u!.id)));
        return r;
      }
    }
    if (p[0] === 'profiles' && p[1] && method === 'GET') {
      const profile = publicProfile(p[1]) || fail(404, 'Профиль не найден');
      if (p[2] === 'shared-trips')
        return json({
          trips: sharedProfileTrips(requireUser(req).id, profile.id),
        });
      if (p[2] === 'avatar') {
        const avatar = one(
          'SELECT image FROM user_avatars WHERE user_id=?',
          profile.id,
        );
        if (!avatar) {
          const account = one(
            'SELECT id FROM accounts WHERE user_id=? AND disk_enabled=1 LIMIT 1',
            profile.id,
          );
          if (account) return accountAvatar(account.id);
          fail(404, 'Аватарка не загружена');
        }
        return new Response(new Uint8Array(avatar.image), {
          headers: {
            'Content-Type': 'image/webp',
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      if (!p[2]) return json({ profile });
    }
    if (p[0] === 'me' && !p[1] && method === 'GET') {
      const u = currentUser(req);
      return json({
        user: u || null,
        yandexEnabled: !!process.env.YANDEX_CLIENT_ID,
      });
    }
    if (p[0] === 'share' && p[1] && method === 'GET') {
      const t =
        one('SELECT id FROM trips WHERE share_hash=?', hash(p[1])) ||
        fail(404, 'Гостевая ссылка недействительна');
      const next = new URL(req.url);
      next.searchParams.set('share', p[1]);
      return json(tripData(new Request(next, { headers: req.headers }), t.id));
    }
    if (p[0] === 'invites' && p[1]) {
      const invite =
        one(
          'SELECT i.*,t.title,t.destination FROM invites i JOIN trips t ON t.id=i.trip_id WHERE i.hash=? AND i.expires>? AND i.used=0',
          hash(p[1]),
          Date.now(),
        ) || fail(404, 'Приглашение истекло или уже использовано');
      if (method === 'GET')
        return json({
          title: invite.title,
          destination: invite.destination,
          start: invite.start,
          end: invite.end,
        });
      if (method === 'POST') {
        const u = requireUser(req);
        db.transaction(() => {
          if (
            !run(
              'UPDATE invites SET used=1 WHERE hash=? AND used=0',
              invite.hash,
            ).changes
          )
            fail(409, 'Приглашение уже принято');
          const t = one('SELECT * FROM trips WHERE id=?', invite.trip_id)!;
          if (t.owner_id === u.id) fail(400, 'Вы уже владелец');
          if (
            one(
              'SELECT * FROM members WHERE trip_id=? AND user_id=? AND active=1',
              t.id,
              u.id,
            )
          )
            fail(409, 'Вы уже участвуете');
          run(
            'INSERT INTO members (trip_id,user_id,start,end,active) VALUES (?,?,?,?,1) ON CONFLICT(trip_id,user_id) DO UPDATE SET start=excluded.start,end=excluded.end,active=1',
            t.id,
            u.id,
            invite.start,
            invite.end,
          );
        })();
        return json({ tripId: invite.trip_id });
      }
    }
    if (
      (p[0] === 'media' && p[1]) ||
      (p[0] === 'my-media' &&
        p[1] &&
        method === 'GET' &&
        ['preview', 'original', 'download'].includes(p[2]) &&
        !p[3])
    ) {
      if (
        method === 'GET' &&
        p[2] === 'places' &&
        p[3] &&
        ['image', 'text', 'geometry'].includes(p[4])
      ) {
        const m = mediaFor(req, p[1]);
        const place =
          one(
            'SELECT url,title,summary FROM confirmed_places WHERE id=? AND media_id=? AND trip_id=?',
            p[3],
            m.id,
            m.trip_id,
          ) || fail(404, 'Место не найдено');
        const articleLanguage = req.headers.get('X-QuestKeeps-Language');
        const osmId = osmAreaId(place.url);
        if (osmId) {
          const area =
            one('SELECT * FROM map_areas WHERE id=?', osmId) ||
            fail(404, 'Место не найдено');
          if (p[4] === 'geometry') return json(JSON.parse(area.geometry));
          if (articleLanguage && p[4] !== 'geometry') {
            const info = await areaWiki(
              m.trip_id,
              osmId,
              articleLanguage === 'en' ? 'en' : 'ru',
            );
            return json(
              p[4] === 'image'
                ? { image: info.image }
                : { ...info, summary: info.description, available: !!info.url },
            );
          }
          if (p[4] === 'text')
            return json({ description: area.summary, summary: area.summary });
          return json({ image: null });
        }
        const pageId = Number(new URL(place.url).searchParams.get('curid'));
        if (!Number.isSafeInteger(pageId) || pageId <= 0)
          return json({ image: null });
        if (articleLanguage && p[4] !== 'geometry') {
          const info = await localizedWikiArticle(
            pageId,
            articleLanguage === 'en' ? 'en' : 'ru',
          );
          return json(
            p[4] === 'image'
              ? {
                  image: info.pageId
                    ? await placeImage(info.pageId, info.language, req.signal)
                    : null,
                }
              : info,
          );
        }
        if (p[4] === 'image')
          return json({ image: await placeImage(pageId, 'ru', req.signal) });
        if (p[4] === 'geometry')
          return json(await placeGeometry(pageId, place.title, place.summary));
        const existing = placeTextContent(place.summary || '');
        if (existing.description) return json(existing);
        const text = await placeText(pageId);
        run(
          'UPDATE confirmed_places SET summary=? WHERE url=?',
          text.summary,
          place.url,
        );
        return json(text);
      }

      if (
        method === 'GET' &&
        ['preview', 'original', 'download'].includes(p[2])
      ) {
        const m =
          p[0] === 'my-media'
            ? ownProfileMedia(req, p[1])
            : mediaFor(req, p[1]);
        const range = req.headers.get('range');
        if (range && !/^bytes=\d*-\d*$/.test(range))
          fail(416, 'Некорректный диапазон');
        const r = await fetchMedia(m, p[2] === 'preview', range, req.signal);
        if (!r.ok && r.status !== 206)
          fail(r.status === 404 ? 404 : 502, 'Файл на Диске недоступен');
        const previewType = (r.headers.get('content-type') || '')
          .split(';')[0]
          .toLowerCase();
        if (
          p[2] === 'preview' &&
          ![
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/avif',
            'image/gif',
          ].includes(previewType)
        ) {
          await r.body?.cancel();
          fail(502, 'Яндекс не вернул изображение миниатюры');
        }
        const headers = new Headers({
          'Cache-Control': 'private, no-store',
          'Content-Type': p[2] === 'preview' ? previewType : m.mime,
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "sandbox; default-src 'none'",
        });
        for (const h of ['content-length', 'content-range', 'accept-ranges'])
          if (r.headers.has(h)) headers.set(h, r.headers.get(h)!);
        headers.set(
          'Content-Disposition',
          (p[2] === 'download' ? 'attachment' : 'inline') +
            "; filename*=UTF-8''" +
            encodeURIComponent(m.name),
        );
        return new Response(r.body, { status: r.status, headers });
      }
      const u = requireUser(req);
      const m =
        one('SELECT * FROM media WHERE id=?', p[1]) ||
        fail(404, 'Файл не найден');
      if (p[2] === 'favorite' && method === 'PATCH') {
        const access = membership(m.trip_id, u.id);
        assertDay(m.taken.slice(0, 10), access);
        mediaFor(req, m.id);
        const input = z
          .object({ favorite: z.boolean() })
          .parse(await body(req));
        if (input.favorite)
          run(
            'INSERT OR IGNORE INTO media_favorites(user_id,media_id) VALUES (?,?)',
            u.id,
            m.id,
          );
        else
          run(
            'DELETE FROM media_favorites WHERE user_id=? AND media_id=?',
            u.id,
            m.id,
          );
        return json({ favorite: input.favorite });
      }
      if (method === 'PATCH') {
        if (m.user_id !== u.id)
          fail(403, 'Можно менять только свои фотографии');
        const input = z
          .object({
            title: z.string().trim().min(1).max(160).optional(),
            hidden: z.boolean().optional(),
            lat: z.number().min(-90).max(90).optional(),
            lon: z.number().min(-180).max(180).optional(),
          })
          .parse(await body(req));
        if (input.title !== undefined) {
          assertDay(m.taken.slice(0, 10), membership(m.trip_id, u.id));
          mediaFor(req, m.id);
          run(
            'INSERT INTO media_titles(media_id,title) VALUES (?,?) ON CONFLICT(media_id) DO UPDATE SET title=excluded.title',
            m.id,
            input.title,
          );
        }
        if (input.hidden !== undefined)
          run(
            'UPDATE media SET hidden=? WHERE id=?',
            Number(input.hidden),
            m.id,
          );
        if (input.lat !== undefined && input.lon !== undefined) {
          assertDay(m.taken.slice(0, 10), membership(m.trip_id, u.id));
          run(
            'UPDATE media SET lat=?,lon=? WHERE id=?',
            input.lat,
            input.lon,
            m.id,
          );
          run('DELETE FROM confirmed_places WHERE media_id=?', m.id);
        }
        return json({ ok: true });
      }
      if (p[2] === 'places') {
        const t = membership(m.trip_id, u.id);
        assertDay(m.taken.slice(0, 10), t);
        if (m.hidden || m.missing) fail(404, 'Файл недоступен');
        mediaFor(req, m.id);
        if (method === 'DELETE' && p[3]) {
          if (m.user_id !== u.id && t.role !== 'owner')
            fail(403, 'Удалить место может автор или владелец');
          const place =
            one(
              'SELECT id FROM confirmed_places WHERE id=? AND media_id=? AND trip_id=?',
              p[3],
              m.id,
              m.trip_id,
            ) || fail(404, 'Место не найдено');
          run(
            'DELETE FROM confirmed_places WHERE id=? AND media_id=?',
            place.id,
            m.id,
          );
          return json({ ok: true });
        }
        if (m.lat === null || m.lon === null)
          fail(400, 'У фотографии нет координат');
        if (method === 'GET' && p[3] === 'description') {
          const pageId = z.coerce
            .number()
            .int()
            .positive()
            .parse(new URL(req.url).searchParams.get('pageId'));
          throttle('place-description:' + u.id, 120, 60000);
          await placeSummary(pageId, { lat: m.lat, lon: m.lon });
          const language = req.headers.get('X-QuestKeeps-Language');
          return json(
            language
              ? await localizedWikiArticle(
                  pageId,
                  language === 'en' ? 'en' : 'ru',
                )
              : await placeText(pageId),
          );
        }
        if (method === 'GET') {
          return json({
            suggestions: await nearby(m.lat, m.lon, () =>
              throttle('place-search:' + u.id, 120, 60000),
            ),
          });
        }
        if (method === 'POST') {
          if (m.user_id !== u.id && t.role !== 'owner')
            fail(403, 'Подтвердить место может автор или владелец');
          const input = z
            .object({ pageId: z.number().int().positive() })
            .parse(await body(req));
          const summary = await placeSummary(input.pageId, {
            lat: m.lat,
            lon: m.lon,
          });
          const title = summary.title.slice(0, 160);
          db.transaction(() => {
            run(
              'INSERT INTO confirmed_places(id,trip_id,media_id,title,summary,url,lat,lon,day,distance) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(trip_id,media_id,url) DO UPDATE SET title=excluded.title,summary=excluded.summary,lat=excluded.lat,lon=excluded.lon,distance=excluded.distance',
              id(),
              m.trip_id,
              m.id,
              summary.title,
              summary.summary,
              summary.url,
              summary.lat,
              summary.lon,
              m.taken.slice(0, 10),
              summary.distance,
            );
            run(
              'INSERT INTO media_titles(media_id,title) VALUES (?,?) ON CONFLICT(media_id) DO UPDATE SET title=excluded.title',
              m.id,
              title,
            );
          })();
          return json({
            title,
            place: one(
              'SELECT * FROM confirmed_places WHERE trip_id=? AND media_id=? AND url=?',
              m.trip_id,
              m.id,
              summary.url,
            ),
          });
        }
      }
    }
    const u = requireUser(req);
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
      fail(404, 'Маршрут не найден');
    }
    if (p[0] === 'friends') {
      if (!p[1] && method === 'GET') return json(friendLists(u.id));
      if (p[1] && !p[2]) {
        const targetId = z.string().min(1).max(100).parse(p[1]);
        if (!one('SELECT 1 FROM users WHERE id=?', targetId))
          fail(404, 'Пользователь не найден');
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
      fail(404, 'Маршрут не найден');
    }
    if (p[0] === 'profiles' && !p[1] && method === 'GET') {
      throttle('profile-search:' + u.id, 120, 60000);
      return json({ users: findProfiles(url.searchParams.get('q') || '') });
    }
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
              fail(409, 'Этот юзернейм уже занят');
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
          fail(404, 'Аватарка не загружена');
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
    if (p[0] === 'accounts') {
      if (p[1] && !p[2] && method === 'DELETE') {
        const account =
          one(
            'SELECT id FROM accounts WHERE id=? AND user_id=? AND disk_enabled=1',
            p[1],
            u.id,
          ) || fail(403, 'Нет доступа');
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
          fail(403, 'Нет доступа');
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
          fail(403, 'Нет доступа');
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
            r._embedded && offset + 100 < r._embedded.total
              ? offset + 100
              : null,
        });
      }
    }
    if (p[0] === 'trips' && p[1] === 'infer' && method === 'POST') {
      const input = z
        .object({
          accountId: z.string().min(1),
          path: z.string().max(4096),
          dates: z.boolean(),
          destination: z.boolean(),
          language: z.enum(['ru', 'en']).default('ru'),
        })
        .refine((v) => v.dates || v.destination, 'Выберите, что определить')
        .parse(await body(req));
      throttle('infer:' + u.id, 12);
      return json(await inferTrip(u.id, input, req.signal));
    }
    if (p[0] === 'trips') {
      if (!p[1]) {
        if (method === 'GET')
          return json({
            trips: all(
              'SELECT DISTINCT t.id,t.title,t.destination,t.start,t.end,t.description,(SELECT count(*) FROM media m JOIN sources s ON s.id=m.source_id WHERE m.trip_id=t.id AND m.hidden=0 AND m.missing=0 AND s.approved=1 AND (t.owner_id=? OR substr(m.taken,1,10) BETWEEN mb.start AND mb.end)) media_count FROM trips t LEFT JOIN members mb ON mb.trip_id=t.id AND mb.user_id=? AND mb.active=1 WHERE t.owner_id=? OR mb.user_id=? ORDER BY t.created DESC',
              u.id,
              u.id,
              u.id,
              u.id,
            ),
          });
        if (method === 'POST') {
          const input = z
            .object({
              title: z.string().trim().min(1).max(120),
              destination: z.string().trim().min(1).max(1000),
              description: z.string().max(3000).default(''),
              start: day,
              end: day,
              source: z
                .object({ accountId: z.string(), path: z.string().max(4096) })
                .optional(),
            })
            .refine((x) => x.start <= x.end, 'Дата окончания раньше начала')
            .parse(await body(req));
          let selectedFolder: string | undefined;
          if (input.source) {
            selectedFolder = ownFolder(
              u.id,
              input.source.accountId,
              input.source.path,
            );
            const meta = await disk(input.source.accountId, 'resources', {
              path: selectedFolder,
              limit: '0',
            });
            if (meta.type !== 'dir') fail(400, 'Выберите папку с фотографиями');
          }
          const tid = id(),
            sourceId = input.source ? id() : null;
          db.transaction(() => {
            run(
              'INSERT INTO trips(id,owner_id,title,destination,start,end,description,created) VALUES (?,?,?,?,?,?,?,?)',
              tid,
              u.id,
              input.title,
              input.destination,
              input.start,
              input.end,
              input.description,
              Date.now(),
            );
            if (input.source && sourceId)
              run(
                'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,1)',
                sourceId,
                tid,
                u.id,
                input.source.accountId,
                selectedFolder,
              );
          })();
          if (sourceId)
            background?.(async () => {
              try {
                await syncSource(sourceId);
              } catch {
                /* syncSource records the error for the UI and worker retries. */
              }
            });
          return json({ id: tid, sourceId }, 201);
        }
      }
      const tid = p[1];
      if (!p[2] && method === 'GET') return json(tripData(req, tid));
      if (!p[2] && method === 'PATCH') {
        owner(tid, u.id);
        const input = z
          .object({
            description: z.string().max(3000),
            mentions: z
              .array(
                z
                  .object({
                    start: z.number().int().nonnegative(),
                    end: z.number().int().positive(),
                    userId: z.string().min(1).max(100),
                  })
                  .strict(),
              )
              .max(100)
              .optional(),
          })
          .strict()
          .parse(await body(req));
        const description = input.description.trim(),
          leading =
            input.description.length - input.description.trimStart().length;
        const previous = one('SELECT description FROM trips WHERE id=?', tid)!;
        const mentions = (
          input.mentions ||
          (previous.description === description
            ? descriptionMentions(tid, description)
            : [])
        )
          .map((m) => ({
            ...m,
            start: m.start - (input.mentions ? leading : 0),
            end: m.end - (input.mentions ? leading : 0),
          }))
          .sort((a, b) => a.start - b.start);
        let end = 0;
        for (const m of mentions) {
          if (
            m.start < end ||
            m.start < 0 ||
            m.end <= m.start ||
            m.end > description.length ||
            !description.slice(m.start, m.end).trim() ||
            /[\r\n]/.test(description.slice(m.start, m.end))
          )
            fail(400, 'Выдели имя в одной строке');
          if (!one('SELECT 1 FROM users WHERE id=?', m.userId))
            fail(400, 'Пользователь не найден');
          ensureUsername(m.userId);
          end = m.end;
        }
        const linkedMentions = resolveMentions(description, mentions);
        db.transaction(() => {
          run('UPDATE trips SET description=? WHERE id=?', description, tid);
          run('DELETE FROM trip_description_mentions WHERE trip_id=?', tid);
          for (const m of linkedMentions)
            run(
              'INSERT INTO trip_description_mentions VALUES (?,?,?,?)',
              tid,
              m.start,
              m.end,
              m.userId,
            );
        })();
        return json({
          description,
          descriptionMentions: descriptionMentions(tid, description),
        });
      }
      if (p[2] === 'sync' && method === 'POST') {
        const trip = membership(tid, u.id);
        throttle('trip-sync:' + tid + ':' + u.id, 3);
        const sources = all(
          'SELECT id FROM sources WHERE trip_id=? AND approved=1 AND (?=1 OR user_id=?)',
          tid,
          Number(trip.role === 'owner'),
          u.id,
        );
        let synced = 0,
          failed = 0;
        for (const source of sources) {
          try {
            await syncSource(source.id);
            synced++;
          } catch {
            failed++;
          }
        }
        return json({ synced, failed });
      }
      if (p[2] === 'area-suggestions') {
        membership(tid, u.id);
        if (method === 'GET' && p[3] && p[4] === 'wiki')
          return json(
            await areaWiki(
              tid,
              p[3],
              url.searchParams.get('lang') === 'en' ? 'en' : 'ru',
            ),
          );
        if (method === 'GET') return json(await areaSuggestions(tid, u.id));
        if (method === 'POST') {
          const input = z
            .object({
              areaId: z.string().regex(/^osm-(?:way|relation)-[1-9][0-9]*$/),
            })
            .parse(await body(req));
          return json(addAreaToPhotos(tid, u.id, input.areaId));
        }
      }
      if (p[2] === 'places' && p[3] && method === 'DELETE') {
        owner(tid, u.id);
        const osm = /^osm-(way|relation)-([1-9][0-9]*)$/.exec(p[3]);
        const url = osm
          ? 'https://www.openstreetmap.org/' + osm[1] + '/' + osm[2]
          : 'https://ru.wikipedia.org/?curid=' +
            z.coerce.number().int().positive().parse(p[3]);
        const result = run(
          'DELETE FROM confirmed_places WHERE trip_id=? AND url=?',
          tid,
          url,
        );
        if (!result.changes) fail(404, 'Место не найдено');
        return json({ ok: true });
      }

      if (p[2] === 'members') {
        const t = membership(tid, u.id);
        if (method === 'GET')
          return json({
            members: all(
              'SELECT u.id,u.name,m.start,m.end,m.active FROM members m JOIN users u ON u.id=m.user_id WHERE m.trip_id=?',
              tid,
            ),
            owner: one('SELECT id,name FROM users WHERE id=?', t.owner_id),
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
            ) || fail(404, 'Участник не найден');
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
          fail(400, 'Владелец не может выйти из своей поездки');
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
      if (p[2] === 'share' && method === 'POST') {
        owner(tid, u.id);
        const input = z.object({ enabled: z.boolean() }).parse(await body(req));
        const raw = input.enabled ? token() : null;
        run(
          'UPDATE trips SET share_hash=? WHERE id=?',
          raw ? hash(raw) : null,
          tid,
        );
        return json({ url: raw ? appURL() + '/s/' + raw : null });
      }
      if (p[2] === 'notes') {
        const t = membership(tid, u.id);
        if (p[3] && p[4] === 'replies') {
          const note =
            one('SELECT * FROM notes WHERE id=? AND trip_id=?', p[3], tid) ||
            fail(404, 'Запись не найдена');
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
                one(
                  'SELECT * FROM notes WHERE id=? AND trip_id=?',
                  note.id,
                  tid,
                ) || fail(404, 'Запись не найдена');
              assertDay(currentNote.day, t);
              const parent = input.parentId
                ? one(
                    'SELECT * FROM note_replies WHERE id=? AND note_id=?',
                    input.parentId,
                    note.id,
                  )
                : currentNote;
              if (!parent) fail(404, 'Ответ не найден');
              if (parent.deleted || !parent.text)
                fail(400, 'Это сообщение уже удалено');
              if (parent.user_id === u.id)
                fail(400, 'Нельзя отвечать на своё сообщение');
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
              ) || fail(404, 'Ответ не найден');
            if (reply.user_id !== u.id)
              fail(403, 'Можно удалять только свои ответы');
            run(
              "UPDATE note_replies SET text='',deleted=1 WHERE id=?",
              reply.id,
            );
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
            fail(404, 'Запись не найдена');
          assertDay(n.day, t);
          if (n.user_id !== u.id) fail(403, 'Можно удалять только свои записи');
          db.transaction(() => {
            // Keep other participants' replies when the author removes the original text.
            if (
              one('SELECT id FROM note_replies WHERE note_id=? LIMIT 1', n.id)
            )
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
            fail(403, 'Это чужой аккаунт');
          const folder = normalizePath(input.path);
          if (folder === 'disk:/')
            fail(400, 'Выберите папку конкретной поездки');
          const meta = await disk(input.accountId, 'resources', {
            path: folder,
            limit: '0',
          });
          if (meta.type !== 'dir') fail(400, 'Выберите папку');
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
            fail(404, 'Источник не найден');
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
              fail(403, 'Нет доступа');
            run('UPDATE sources SET approved=0 WHERE id=?', s.id);
            return json({ ok: true });
          }
          if (method === 'POST' && p[4] === 'sync') {
            if (t.role !== 'owner' && s.user_id !== u.id)
              fail(403, 'Нет доступа');
            throttle('sync:' + s.id, 10);
            return json(await syncSource(s.id));
          }
        }
      }
    }
    if (p[0] === 'my-media' && method === 'GET') {
      if (p[1] === 'groups' && !p[2])
        return json({ groups: profileMediaGroups(u.id) });
      if (!p[1]) return json(profileMediaPage(u.id, new URL(req.url)));
    }
    fail(404, 'Маршрут не найден');
  } catch (error) {
    if (p[0] === 'auth' && p[1] === 'callback') {
      const reason =
        error instanceof HttpError &&
        error.message === 'Авторизация истекла. Повторите вход'
          ? 'session_expired'
          : error instanceof Error &&
              error.message ===
                'Войдите в существующий профиль и подключите Яндекс'
            ? 'account_link_required'
            : error instanceof Error &&
                error.message ===
                  'Сначала отключите текущий аккаунт Яндекса в профиле'
              ? 'account_already_linked'
              : 'unknown';
      return oauthFailure(reason, currentUser(req) ? 'link' : 'login');
    }
    if (error instanceof z.ZodError)
      return json(
        {
          error: 'Проверьте заполнение формы',
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
          fieldErrors:
            p[0] === 'auth' && p[1] === 'login' && error.status === 401
              ? {
                  email: 'Проверьте email или никнейм',
                  password: 'Неверный email, никнейм или пароль',
                }
              : p[0] === 'auth' && p[1] === 'register' && error.status === 409
                ? { email: error.message }
                : {},
        },
        error.status,
      );
    if (error instanceof Error && error.message.includes('UNIQUE constraint'))
      return json({ error: 'Такая запись уже существует' }, 409);
    console.error('API error:', error instanceof Error ? error.message : error);
    return json(
      { error: 'Не удалось выполнить действие. Повторите позже.' },
      500,
    );
  }
}
