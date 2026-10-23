import {
  verificationRequired,
  mailConfigured,
  emailPending,
  queueVerification,
  confirmEmail,
} from '../email-verification';
import { validRegistrationPassword } from '../password-policy';
import { z } from 'zod';
import { hash as passwordHash, compare } from 'bcryptjs';
import { db, one, run, id, hash } from '../db';
import {
  fail,
  userProfile,
  session,
  sessionCookie,
  cookie,
  throttle,
} from '../access';
import { json, body } from './http';
import { oauth } from './oauth';
import type { RequestContext } from './context';

export async function authRoutes({
  req,
  p,
  method,
}: RequestContext): Promise<Response | undefined> {
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
        fail(400, 'messages.theVerificationLinkIsInvalidOrHas');
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
        queueVerification(
          user.id,
          email,
          req.headers.get('X-QuestKeeps-Language') === 'en' ? 'en' : 'ru',
        );
      return json({
        message: 'messages.ifTheAddressIsAwaitingVerificationWe',
      });
    }

    if (p[1] === 'logout') {
      run('DELETE FROM sessions WHERE hash=?', hash(cookie(req, 'ta_session')));
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
          'messages.enterAnEmailOrUniqueUsername',
        );
      const input = z
        .object({
          email: registering ? emailAddress : loginIdentity,
          password: z.string().min(1, 'messages.enterYourPassword').max(128),
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
            error: 'trip.passwordsDoNotMatch',
            fieldErrors: { passwordConfirmation: 'trip.passwordsDoNotMatch' },
          },
          400,
        );
      if (registering && !validRegistrationPassword(input.password))
        return json(
          {
            error: 'trip.672CharactersUppercaseAndLowercaseLatin',
            fieldErrors: {
              password: 'trip.672CharactersUppercaseAndLowercaseLatin',
            },
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
        if (u) fail(409, 'messages.thisEmailIsAlreadyRegistered');
        if (verificationRequired() && !mailConfigured())
          fail(
            503,
            'messages.registrationIsTemporarilyUnavailableEmailDeliveryIs',
          );
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
          if (verificationRequired())
            queueVerification(
              userId,
              input.email,
              req.headers.get('X-QuestKeeps-Language') === 'en' ? 'en' : 'ru',
            );
        }).immediate();
        u = one('SELECT * FROM users WHERE id=?', userId);
      } else {
        const valid = await compare(
          input.password,
          u?.password ||
            '$2b$12$u4KaOyrGniR5wMopNUZs7eKXiaP6cCcu8KMxD5N0p6d45EswI1/sG',
        );
        if (!u || !u.password || !valid) fail(401, 'auth.invalidCredentials');
      }
      if (emailPending(u!.id))
        return json({
          verificationRequired: true,
          verificationEmail: u!.email,
          message: 'trip.verifyYourEmailUsingTheLinkIn',
        });
      const r = json({ user: userProfile(u!.id) });
      r.headers.set('Set-Cookie', sessionCookie(session(u!.id)));
      return r;
    }
  }
}
