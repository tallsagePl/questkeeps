import { verificationMail } from '../lib/verification-email';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sendMail } from '../lib/email-verification';
import { db } from '../lib/db';

try {
  const recipient = z.email().parse(process.argv[2]);
  await sendMail(
    await verificationMail(recipient, 'https://questkeeps.ru', true),
    'test-' + randomUUID(),
  );
  console.log(
    'Resend accepted the test email. Check the recipient inbox and spam folder.',
  );
} finally {
  db.close();
}
