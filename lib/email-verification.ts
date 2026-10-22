import { db, one, run, id, token, hash, encrypt, decrypt } from './db';
export function verificationRequired() {
  return process.env.EMAIL_VERIFICATION_REQUIRED === 'true';
}
export function mailConfigured() {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}
export function emailPending(userId: string) {
  return !!one(
    'SELECT 1 FROM email_status WHERE user_id=? AND required=1 AND verified_at IS NULL',
    userId,
  );
}
export function queueVerification(userId: string, email: string) {
  const raw = token(),
    expires = Date.now() + 86400000,
    origin = new URL(process.env.APP_URL || 'http://localhost:3000').origin;
  if (
    !origin.startsWith('https://') &&
    !['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)
  )
    throw Error('Email verification requires HTTPS');
  db.transaction(() => {
    run('DELETE FROM email_verifications WHERE user_id=?', userId);
    run(
      "UPDATE delivery_jobs SET finished=?,payload='' WHERE kind='verify-email' AND user_id=? AND finished IS NULL",
      Date.now(),
      userId,
    );
    run(
      'INSERT INTO email_verifications VALUES (?,?,?)',
      hash(raw),
      userId,
      expires,
    );
    run(
      'INSERT INTO delivery_jobs (id,kind,user_id,payload,created,available) VALUES (?,?,?,?,?,?)',
      id(),
      'verify-email',
      userId,
      encrypt(
        JSON.stringify({
          userId,
          to: email,
          url: origin + '/verify-email#token=' + raw,
          expires,
        }),
      ),
      Date.now(),
      Date.now(),
    );
  }).immediate();
}
export function confirmEmail(raw: string) {
  return db
    .transaction(() => {
      const row = one(
        'SELECT user_id FROM email_verifications WHERE hash=? AND expires>?',
        hash(raw),
        Date.now(),
      );
      if (!row) return false;
      run(
        'UPDATE email_status SET verified_at=? WHERE user_id=?',
        Date.now(),
        row.user_id,
      );
      run('DELETE FROM email_verifications WHERE user_id=?', row.user_id);
      run(
        "UPDATE delivery_jobs SET finished=?,payload='' WHERE kind='verify-email' AND user_id=? AND finished IS NULL",
        Date.now(),
        row.user_id,
      );
      return true;
    })
    .immediate();
}
export type Mail = { to: string; subject: string; text: string };
export async function sendMail(mail: Mail, jobId: string) {
  if (!mailConfigured()) throw Error('Mail transport is disabled');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'questkeeps/' + jobId,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
    }),
  });
  if (!response.ok) throw Error('Mail provider rejected delivery');
}
export async function deliverEmails(
  transport: (mail: Mail, jobId: string) => Promise<void> = sendMail,
  now = Date.now(),
) {
  if (transport === sendMail && !mailConfigured())
    return { sent: 0, failed: 0 };
  run('DELETE FROM email_verifications WHERE expires<?', now);
  run('DELETE FROM delivery_jobs WHERE created<?', now - 7 * 86400000);
  let sent = 0,
    failed = 0;
  for (let i = 0; i < 10; i++) {
    const lease = token();
    const job = db
      .transaction(() => {
        const row = one(
          "SELECT * FROM delivery_jobs WHERE kind='verify-email' AND finished IS NULL AND attempts<8 AND available<=? AND lease_until<=? ORDER BY created LIMIT 1",
          now,
          now,
        );
        if (!row) return;
        run(
          'UPDATE delivery_jobs SET lease_id=?,lease_until=?,attempts=attempts+1 WHERE id=?',
          lease,
          now + 60000,
          row.id,
        );
        return row;
      })
      .immediate();
    if (!job) break;
    try {
      const payload = JSON.parse(decrypt(job.payload));
      if (payload.expires > now && emailPending(payload.userId)) {
        await transport(
          {
            to: payload.to,
            subject: 'Подтверди почту QuestKeeps',
            text:
              'Подтверди свой email, открыв ссылку и нажав кнопку подтверждения: ' +
              payload.url +
              '\nСсылка действует 24 часа. Если ты не регистрировался, проигнорируй письмо.',
          },
          job.id,
        );
        sent++;
      }
      run(
        "UPDATE delivery_jobs SET finished=?,payload='',lease_id=NULL,lease_until=0 WHERE id=? AND lease_id=?",
        Date.now(),
        job.id,
        lease,
      );
    } catch {
      failed++;
      const attempts = Number(job.attempts) + 1;
      run(
        "UPDATE delivery_jobs SET available=?,lease_id=NULL,lease_until=0,last_error=?,finished=?,payload=CASE WHEN ? THEN '' ELSE payload END WHERE id=? AND lease_id=?",
        now + Math.min(3600000, 30000 * 2 ** attempts),
        'delivery_failed',
        attempts >= 8 ? now : null,
        Number(attempts >= 8),
        job.id,
        lease,
      );
    }
  }
  return { sent, failed };
}
