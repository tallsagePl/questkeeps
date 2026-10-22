import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:3101',
    channel: 'msedge',
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/test-server.mjs',
    url: 'http://127.0.0.1:3101',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      APP_URL: 'http://127.0.0.1:3101',
      DATABASE_PATH: './data/e2e.sqlite',
    },
  },
});
