import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test('Drive sync returns immediately, polls a small status and publishes metadata without reloading the page', async ({
  page,
}) => {
  const trip = {
    id: 'queued-sync',
    title: 'Queue fixture',
    destination: 'Fixture',
    role: 'owner',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    description: '',
    sharing: false,
  };
  const photo = {
    id: 'new-photo',
    name: 'Recovered photo',
    kind: 'photo',
    mime: 'image/jpeg',
    taken: '2026-10-13',
    user_id: 'owner',
    author: 'Owner',
    lat: 41.7,
    lon: 44.8,
    revision: '1',
    hidden: 0,
  };
  let queued = false;
  let complete = false;
  let posted = 0;
  let tripLoads = 0;
  let statusLoads = 0;
  const image = await sharp({
    create: { width: 40, height: 30, channels: 3, background: '#778899' },
  })
    .jpeg()
    .toBuffer();
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    let json: unknown = {};
    if (path === '/api/me')
      json = { user: { id: 'owner', name: 'Owner' }, yandexEnabled: true };
    else if (path === '/api/trips') json = { trips: [trip] };
    else if (path === '/api/trips/queued-sync') {
      tripLoads++;
      json = {
        trip,
        media: complete ? [photo] : [],
        places: [],
        notes: [],
        importStatus: {
          sourceCount: 1,
          waiting: queued && !complete,
          syncing: queued && !complete,
          metadataPending: queued && !complete ? 1 : 0,
          metadataWaiting: queued && !complete ? 1 : 0,
        },
      };
    } else if (path === '/api/trips/queued-sync/sync') {
      if (req.method() === 'POST') {
        queued = true;
        posted++;
        return route.fulfill({ status: 202, json: { queued: 1, failed: 0 } });
      }
      statusLoads++;
      json = {
        active: !complete,
        jobs: [
          {
            sourceId: 'source',
            jobId: 'job',
            state: complete ? 'complete' : 'scanning',
            scanned: 1,
            count: complete ? 1 : 0,
            finished: complete ? 123 : null,
          },
        ],
        metadata: {
          total: 1,
          active: complete ? 0 : 1,
          waiting: complete ? 0 : 1,
          errors: 0,
          completed: complete ? 1 : 0,
          updated: 123,
        },
      };
    } else if (path.endsWith('/sources')) json = { sources: [] };
    else if (path.endsWith('/members')) json = { members: [] };
    else if (path === '/api/accounts') json = { accounts: [] };
    else if (path === '/api/follows') json = { trips: [] };
    else if (path === '/api/invitations') json = { invitations: [], count: 0 };
    else if (path.endsWith('/preview'))
      return route.fulfill({ body: image, contentType: 'image/jpeg' });
    else if (path.includes('area-suggestions'))
      json = { suggestions: [], areas: [] };
    return route.fulfill({ json });
  });
  const crashes: string[] = [];
  page.on('pageerror', (e) => crashes.push(e.message));
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/?trip=queued-sync');
  await page
    .getByRole('button', { name: 'Загрузить новые фотографии', exact: true })
    .click();
  await expect(
    page.getByText(
      'Обновление поставлено в очередь. Фотографии появятся автоматически.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText('Уточняем даты и места · осталось: 1'),
  ).toBeVisible();
  await expect.poll(() => statusLoads).toBeGreaterThan(0);
  const baseline = tripLoads;
  await page.waitForTimeout(3200);
  expect(tripLoads).toBeLessThanOrEqual(baseline + 1);
  complete = true;
  await expect(page.locator('.photo-card')).toHaveCount(1, { timeout: 18000 });
  await expect(
    page.getByRole('button', {
      name: 'Загрузить новые фотографии',
      exact: true,
    }),
  ).toBeEnabled();
  expect(posted).toBe(1);
  expect(crashes).toEqual([]);
  await page.screenshot({
    path: 'test-results/source-sync-mobile.png',
    fullPage: true,
  });
});
