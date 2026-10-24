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
  await page.body?.cancel();
} catch {
  process.exit(1);
}
