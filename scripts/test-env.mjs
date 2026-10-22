// Unit tests never import the developer's .env.local or production database.
import { randomUUID } from 'node:crypto';
process.env.DATABASE_PATH = './data/test-' + randomUUID() + '.sqlite';
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
