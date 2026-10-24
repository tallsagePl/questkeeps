const base = process.env.HEALTH_URL || 'http://127.0.0.1:3000';

try {
  const [page, api] = await Promise.all(
    ['/', '/api/me'].map((path) =>
      fetch(base + path, {
        signal: AbortSignal.timeout(4000),
        redirect: 'error',
      }),
    ),
  );
  if (
    page.status !== 200 ||
    api.status !== 200 ||
    !Object.hasOwn(await api.json(), 'user')
  )
    process.exit(1);
  if (process.env.HEALTH_ASSET_BASE) {
    const html = await page.text();
    const paths = [
      ...new Set(
        [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map(
          (match) => match[1].replaceAll('&amp;', '&'),
        ),
      ),
    ];
    if (!paths.length) process.exit(1);
    await Promise.all(
      paths.map(async (path) => {
        const response = await fetch(
          new URL(path, process.env.HEALTH_ASSET_BASE),
          {
            method: 'HEAD',
            signal: AbortSignal.timeout(4000),
            redirect: 'error',
          },
        );
        if (response.status !== 200) throw Error('Static asset unavailable');
      }),
    );
  } else await page.body?.cancel();
} catch {
  process.exit(1);
}
