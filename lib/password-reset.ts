import { validRegistrationPassword } from './password-policy';
import { hash as passwordHash } from 'bcryptjs';
import { db, one, run, hash, token, id, encrypt } from './db';
import { fail } from './access';

export function resetPending(
  resetHash: string,
  userId: string,
  now = Date.now(),
) {
  const row = one(
    `SELECT r.credential_hash,u.password,u.email FROM password_resets r JOIN users u ON u.id=r.user_id
    JOIN email_status e ON e.user_id=u.id WHERE r.hash=? AND r.user_id=? AND r.expires>? AND e.verified_at IS NOT NULL`,
    resetHash,
    userId,
    now,
  );
  return (
    !!row &&
    row.credential_hash ===
      hash(JSON.stringify([row.password || '', row.email]))
  );
}

export function queuePasswordReset(email: string, language: 'ru' | 'en') {
  const origin = new URL(process.env.APP_URL || 'http://localhost:3000').origin;
  if (
    !origin.startsWith('https://') &&
    !['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)
  )
    throw Error('Password reset requires HTTPS');
  db.transaction(() => {
    run('DELETE FROM password_resets WHERE expires<=?', Date.now());
    const user = one(
      `SELECT u.id,u.password,u.email FROM users u JOIN email_status e ON e.user_id=u.id WHERE u.email=? AND e.verified_at IS NOT NULL`,
      email,
    );
    if (!user) return;
    const raw = token();
    const resetHash = hash(raw);
    const expires = Date.now() + 30 * 60000;
    run('DELETE FROM password_resets WHERE user_id=?', user.id);
    run(
      "UPDATE delivery_jobs SET finished=?,payload='' WHERE kind='password-reset' AND user_id=? AND finished IS NULL",
      Date.now(),
      user.id,
    );
    run(
      'INSERT INTO password_resets VALUES (?,?,?,?)',
      resetHash,
      user.id,
      expires,
      hash(JSON.stringify([user.password || '', user.email])),
    );
    run(
      'INSERT INTO delivery_jobs(id,kind,user_id,payload,created,available) VALUES (?,?,?,?,?,?)',
      id(),
      'password-reset',
      user.id,
      encrypt(
        JSON.stringify({
          userId: user.id,
          to: email,
          url: origin + '/reset-password#token=' + raw,
          resetHash,
          expires,
          language,
        }),
      ),
      Date.now(),
      Date.now(),
    );
  }).immediate();
}

export async function resetPassword(raw: string, password: string) {
  if (!validRegistrationPassword(password))
    fail(400, 'trip.672CharactersUppercaseAndLowercaseLatin');
  const digest = hash(raw);
  const row = one('SELECT user_id FROM password_resets WHERE hash=?', digest);
  if (!row || !resetPending(digest, row.user_id)) fail(400, 'reset.invalid');
  const encoded = await passwordHash(password, 12);
  return db
    .transaction(() => {
      if (!resetPending(digest, row.user_id)) fail(400, 'reset.invalid');
      run('UPDATE users SET password=? WHERE id=?', encoded, row.user_id);
      run('DELETE FROM sessions WHERE user_id=?', row.user_id);
      run('DELETE FROM password_resets WHERE user_id=?', row.user_id);
      run(
        "UPDATE delivery_jobs SET finished=?,payload='',lease_id=NULL,lease_until=0 WHERE kind='password-reset' AND user_id=? AND finished IS NULL",
        Date.now(),
        row.user_id,
      );
      return row.user_id as string;
    })
    .immediate();
}
