import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test('MOV is attempted in the player; individual photo and video reload preserves the trip', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const trip = {
    id: 'reload',
    title: 'Reload',
    destination: '',
    start: '2026-10-10',
    end: '2026-10-18',
    from: '2026-10-10',
    to: '2026-10-18',
    role: 'owner',
    sharing: false,
    description: '',
  };
  const media = [
    { id: 'photo', name: 'Photo.jpg', kind: 'photo', mime: 'image/jpeg' },
    { id: 'movie', name: 'Movie.MOV', kind: 'video', mime: 'video/quicktime' },
  ].map((m) => ({
    ...m,
    user_id: 'owner',
    author: 'Author',
    taken: '2026-10-11',
    hidden: 0,
    lat: null,
    lon: null,
    revision: '1',
  }));
  let tripLoads = 0;
  await page.route('**/api/me', (r) =>
    r.fulfill({
      json: { user: { id: 'owner', name: 'Author' }, yandexEnabled: true },
    }),
  );
  await page.route('**/api/trips', (r) =>
    r.fulfill({ json: { trips: [trip] } }),
  );
  await page.route('**/api/trips/reload', (r) => {
    tripLoads++;
    return r.fulfill({
      json: {
        trip,
        media,
        places: [],
        notes: [],
        sources: [],
        importStatus: { sourceCount: 1 },
      },
    });
  });
  const image = await sharp({
    create: { width: 320, height: 240, channels: 3, background: '#7755aa' },
  })
    .jpeg()
    .toBuffer();
  let previewReloads = 0;
  await page.route('**/api/media/*/preview*', (r) => {
    if (r.request().url().includes('reload=')) previewReloads++;
    return r.fulfill({ body: image, contentType: 'image/jpeg' });
  });
  let originalReloads = 0;
  await page.route('**/api/media/photo/original*', (r) => {
    if (!r.request().url().includes('reload=')) return r.abort();
    originalReloads++;
    return r.fulfill({ body: image, contentType: 'image/jpeg' });
  });
  let videoRequests = 0;
  let clip: Buffer | undefined;
  await page.route('**/api/media/movie/original*', (r) => {
    videoRequests++;
    return clip
      ? r.fulfill({ body: clip, contentType: 'video/webm' })
      : r.fulfill({ status: 502, body: 'Unavailable' });
  });
  await page.goto('/?trip=reload');
  await page.locator('.photo-card').first().click();
  const dialog = page.locator('dialog.modal');
  const reload = dialog.getByRole('button', {
    name: 'Перезагрузить фото или видео',
    exact: true,
  });
  await expect(dialog.locator('.viewer-original')).toHaveCount(0);
  const initialTripLoads = tripLoads;
  await reload.click();
  await expect(dialog.locator('.viewer-original')).toHaveAttribute(
    'data-state',
    'loaded',
  );
  await expect.poll(() => previewReloads).toBe(1);
  expect(originalReloads).toBe(1);
  const close = dialog.getByRole('button', { name: 'Закрыть', exact: true });
  const rb = await reload.boundingBox();
  const cb = await close.boundingBox();
  expect(rb!.x + rb!.width).toBeLessThanOrEqual(cb!.x);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(reload).toBeVisible();
  await page.screenshot({ path: 'test-results/media-reload-mobile.png' });
  await close.click();
  await page.locator('.photo-card').nth(1).click();
  await expect(dialog.locator('video')).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Воспроизвести', exact: true })
    .click();
  await expect(dialog.locator('.video-playback-error')).toContainText(
    'Видео не удалось воспроизвести',
  );
  clip = Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      const done = new Promise<number[]>((resolve) => {
        recorder.onstop = async () =>
          resolve([...new Uint8Array(await new Blob(chunks).arrayBuffer())]);
      });
      recorder.start();
      const ctx = canvas.getContext('2d')!;
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 ? '#7755aa' : '#5577aa';
        ctx.fillRect(0, 0, 64, 64);
        (
          stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
        ).requestFrame();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      recorder.stop();
      const bytes = await done;
      stream.getTracks().forEach((track) => track.stop());
      return bytes;
    }),
  );
  const before = videoRequests;
  await reload.click();
  await expect.poll(() => videoRequests).toBeGreaterThan(before);
  await expect(dialog.locator('video')).toHaveAttribute('src', /reload=/);
  await expect
    .poll(() =>
      dialog.locator('video').evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThanOrEqual(1);
  await expect(dialog.locator('.video-playback-error')).toHaveCount(0);
  await dialog
    .getByRole('button', { name: 'Воспроизвести', exact: true })
    .click();
  await expect
    .poll(() =>
      dialog.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime),
    )
    .toBeGreaterThan(0);
  await dialog.locator('.questkeeps-video-player').click();
  await dialog.locator('.questkeeps-video-player').press('ArrowRight');
  await expect(dialog.locator('video')).toHaveAttribute('src', /movie/);
  const width = await dialog
    .locator('.questkeeps-video-player')
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/media-reload-video.png' });
  expect(tripLoads).toBe(initialTripLoads);
  expect(errors).toEqual([]);
});
