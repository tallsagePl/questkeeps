// Capture only fictional fixtures. No authenticated browser or live API data.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
const base = new URL(process.env.ABOUT_CAPTURE_URL || 'http://localhost:3000');
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
  throw Error('Only loopback capture is allowed');
const output = 'public/about/screenshots';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const thumb = await sharp({
  create: { width: 320, height: 220, channels: 3, background: '#b9cad5' },
})
  .png()
  .toBuffer();
try {
  for (const language of ['ru', 'en'])
    for (const theme of ['light', 'dark']) {
      const en = language === 'en',
        context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          deviceScaleFactor: 1,
          reducedMotion: 'reduce',
          colorScheme: theme,
        });
      const page = await context.newPage();
      await page.addInitScript(
        ({ language, theme }) => {
          localStorage.setItem('ta-language', language);
          localStorage.setItem('ta-theme', theme);
        },
        { language, theme },
      );
      const trip = {
        id: 'demo-bosphorus',
        title: en ? 'Three days by the Bosphorus' : 'Три дня у Босфора',
        destination: en ? 'Istanbul, Türkiye' : 'Стамбул, Турция',
        start: '2026-05-10',
        end: '2026-05-12',
        from: '2026-05-10',
        to: '2026-05-12',
        role: 'owner',
        description: en
          ? 'Ferries, warm evenings and nowhere to rush.'
          : 'Паромы, тёплые вечера и никуда не нужно спешить.',
        sharing: false,
        media_count: 18,
      };
      const trips = [
        trip,
        {
          ...trip,
          id: 'demo-tbilisi',
          title: en ? 'A weekend in Tbilisi' : 'Выходные в Тбилиси',
          destination: en ? 'Tbilisi, Georgia' : 'Тбилиси, Грузия',
          start: '2026-04-18',
          end: '2026-04-20',
          media_count: 24,
        },
        {
          ...trip,
          id: 'demo-karelia',
          title: en ? 'A little closer to the lake' : 'Чуть ближе к озеру',
          destination: en ? 'Karelia' : 'Карелия',
          start: '2026-02-14',
          end: '2026-02-16',
          media_count: 12,
        },
      ];
      const media = [
        [41.0256, 28.9741],
        [41.0086, 28.9802],
        [41.0176, 28.9717],
      ].map(([lat, lon], i) => ({
        id: 'demo-photo-' + i,
        name: en ? 'A walk through the city' : 'Прогулка по городу',
        kind: 'photo',
        mime: 'image/png',
        taken: '2026-05-10T16:30:00',
        date_basis: 'exif',
        lat,
        lon,
        user_id: 'demo-owner',
        author: en ? 'Alex' : 'Саша',
        hidden: 0,
      }));
      const notes = [
        {
          id: 'demo-note-1',
          user_id: 'demo-owner',
          author: en ? 'Alex' : 'Саша',
          day: '2026-05-10',
          text: en
            ? 'We took the ferry with no plan. Tea in little glasses, seagulls overhead, and the city slowly unfolding on both banks. I want to remember this unhurried afternoon.'
            : 'Сели на паром без всякого плана. Чай в маленьких стаканах, чайки над головой, и город медленно раскрывается по обоим берегам. Хочется запомнить этот неспешный день.',
        },
        {
          id: 'demo-note-2',
          user_id: 'demo-friend',
          author: en ? 'Maya' : 'Майя',
          day: '2026-05-11',
          text: en
            ? 'Found a tiny café on a side street. We stayed until the lights came on. The best part of the day never made it into a photograph.'
            : 'Нашли крошечное кафе в переулке. Просидели до тех пор, пока не зажглись фонари. Лучшая часть дня так и не попала на фотографию.',
        },
      ];
      await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname.slice(5);
        let json = {};
        if (path === 'me')
          json = {
            user: {
              id: 'demo-owner',
              name: en ? 'Alex' : 'Саша',
              username: 'demo_alex',
            },
            yandexEnabled: false,
          };
        else if (path === 'trips') json = { trips };
        else if (path === 'friends')
          json = {
            friends: [
              {
                id: 'demo-friend',
                name: en ? 'Maya' : 'Майя',
                username: 'demo_maya',
                hasAvatar: false,
              },
              {
                id: 'demo-friend-2',
                name: en ? 'Nikita' : 'Никита',
                username: 'demo_nikita',
                hasAvatar: false,
              },
            ],
            incoming: [],
            outgoing: [],
          };
        else if (path === 'trips/' + trip.id)
          json = {
            trip,
            media,
            notes,
            places: [],
            sources: [],
            noteReplies: [],
            importStatus: { sourceCount: 1, waiting: false, syncing: false },
          };
        else if (path.includes('/preview'))
          return route.fulfill({ body: thumb, contentType: 'image/png' });
        else if (path.endsWith('/area-suggestions'))
          json = { candidates: [], incomplete: false };
        else if (path.endsWith('/places')) json = { suggestions: [] };
        else if (path.endsWith('/geometry'))
          json = { type: 'FeatureCollection', features: [] };
        else if (path === 'config') json = {};
        return route.fulfill({ json });
      });
      async function capture(name) {
        await page.evaluate(() => document.fonts.ready);
        const buffer = await page.screenshot({
          type: 'png',
          animations: 'disabled',
        });
        await writeFile(
          output + '/' + language + '-' + theme + '-' + name + '.webp',
          await sharp(buffer).webp({ quality: 86 }).toBuffer(),
        );
      }
      await page.goto(base.href);
      await page.locator('.trip-card').first().waitFor();
      await page.locator('.friends-compact-populated').waitFor();
      await capture('trips');
      await page.goto(new URL('/?trip=' + trip.id, base).href);
      await page.locator('.trip-heading').waitFor();
      await page
        .getByRole('navigation', {
          name: en ? 'Trip sections' : 'Разделы поездки',
        })
        .getByRole('button', { name: en ? 'Map' : 'Карта', exact: true })
        .click();
      await page.locator('.leaflet-container').waitFor();
      await page.waitForFunction(
        () => document.querySelectorAll('.leaflet-tile-loaded').length >= 4,
        {},
        { timeout: 15000 },
      );
      await page.waitForFunction(
        () =>
          Array.from(document.querySelectorAll('.leaflet-tile')).every(
            (image) =>
              image.complete &&
              image.naturalWidth > 0 &&
              Number(getComputedStyle(image).opacity) === 1,
          ),
        {},
        { timeout: 15000 },
      );
      await page.evaluate(() => {
        const bar = document.querySelector('.tabbar');
        if (bar) scrollTo(0, bar.getBoundingClientRect().top + scrollY - 24);
      });
      await capture('map');
      await page
        .getByRole('navigation', {
          name: en ? 'Trip sections' : 'Разделы поездки',
        })
        .getByRole('button', { name: en ? 'Journal' : 'Дневник', exact: true })
        .click();
      await page.locator('.notes-layout').waitFor();
      await page.evaluate(() => scrollTo(0, 0));
      await capture('journal');
      await context.close();
      console.log(
        'Captured ' + language + ' / ' + theme + ' using fictional fixtures.',
      );
    }
} finally {
  await browser.close();
}
