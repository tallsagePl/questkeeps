// Persistent keys must never contain share capabilities or provider credentials.
export async function opaqueCacheRequest(source: string) {
  const url = new URL(source, location.origin);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(url.href),
  );
  const key = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  return new Request(new URL('/__questkeeps_cache__/' + key, location.origin));
}

export function clearPrivateLocalStorage() {
  if (typeof localStorage === 'undefined') return;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('questkeeps:')) localStorage.removeItem(key);
    }
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
}

let migrated = false;

export async function migratePrivateStorage() {
  if (migrated || typeof window === 'undefined') return;
  migrated = true;
  try {
    for (const key of Object.keys(localStorage)) {
      if (
        key.startsWith('questkeeps:map-view:v1:') ||
        key.startsWith('questkeeps:found-places:v1:') ||
        (key.startsWith('questkeeps:') && key.includes('guest:'))
      )
        localStorage.removeItem(key);
    }
  } catch {}
  if (typeof caches !== 'undefined')
    await Promise.allSettled(
      (await caches.keys())
        .filter(
          (name) =>
            name.startsWith('questkeeps-previews-v1-') ||
            name.startsWith('questkeeps-place-resources-v3-'),
        )
        .map((name) => caches.delete(name)),
    );
}
