// Unit tests never import the developer's .env.local or production database.
import { randomUUID } from 'node:crypto';

process.env.DATABASE_PATH = './data/test-' + randomUUID() + '.sqlite';

process.env.PREVIEW_CACHE_DIRECTORY = './data/test-preview-' + randomUUID();

process.env.VIDEO_CACHE_DIRECTORY = './data/test-video-' + randomUUID();

process.env.APP_URL = 'http://localhost:3000';

// Next build workers must keep the explicit dummy environment too.
process.env.__NEXT_PROCESSED_ENV = 'true';

process.env.TOKEN_ENCRYPTION_KEY = 'fa'.repeat(32);

process.env.YANDEX_CLIENT_ID = '';

process.env.YANDEX_CLIENT_SECRET = '';

process.env.CRON_SECRET = 'fixture-only-cron-secret';

globalThis.fetch = async () => {
  throw new Error(
    'External requests are disabled in unit tests; install a fixture mock.',
  );
};

process.env.EMAIL_VERIFICATION_REQUIRED = 'false';

process.env.RESEND_API_KEY = '';

process.env.EMAIL_FROM = '';

process.env.TELEGRAM_BOT_TOKEN = '';

process.env.TELEGRAM_ADMIN_ID = '';
