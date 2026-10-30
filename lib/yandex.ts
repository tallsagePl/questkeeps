import { one, run, decrypt, encrypt, hash, Row } from './db';
import { MemoryCache } from './memory-cache';
import { fail } from './access';

export interface Resource {
  path: string;
  name: string;
  type: string;
  resource_id?: string;
  mime_type?: string;
  media_type?: string;
  created?: string;
  modified?: string;
  photoslice_time?: string;
  exif?: { date_time?: string };
  revision?: number;
  preview?: string;
  file?: string;
  _embedded?: { items: Resource[]; total: number };
}

export async function accountToken(accountId: string) {
  const a =
    one('SELECT * FROM accounts WHERE id=?', accountId) ||
    fail(404, 'messages.accountNotFound');
  if (!a.disk_enabled || !a.token)
    fail(409, 'messages.yandexAccountDisconnectedReconnectItInYour');
  if (a.expires && a.expires < Date.now() + 60000 && a.refresh) {
    const response = await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: decrypt(a.refresh),
        client_id: process.env.YANDEX_CLIENT_ID || '',
        client_secret: process.env.YANDEX_CLIENT_SECRET || '',
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) fail(502, 'messages.reconnectYourYandexAccount');
    const data = await response.json();
    run(
      'UPDATE accounts SET token=?,refresh=?,expires=? WHERE id=? AND disk_enabled=1',
      encrypt(data.access_token),
      data.refresh_token ? encrypt(data.refresh_token) : a.refresh,
      data.expires_in ? Date.now() + data.expires_in * 1000 : null,
      a.id,
    );
    return data.access_token as string;
  }
  return decrypt(a.token);
}

export async function disk(
  accountId: string,
  endpoint: string,
  params: Record<string, string> = {},
  signal?: AbortSignal,
) {
  const auth = await accountToken(accountId);
  const response = await fetch(
    'https://cloud-api.yandex.net/v1/disk/' +
      endpoint +
      '?' +
      new URLSearchParams(params),
    {
      headers: { Authorization: 'OAuth ' + auth },
      cache: 'no-store',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(25000)])
        : AbortSignal.timeout(25000),
    },
  );
  if (!response.ok) {
    if (response.status === 401)
      fail(502, 'messages.reconnectYourYandexAccount');
    if (response.status === 404)
      fail(404, 'messages.fileOrFolderNotFoundOnDrive');
    fail(502, {
      key: 'errors.yandexUnavailable',
      params: { status: response.status },
    });
  }
  return response.json();
}

export function normalizePath(p: string) {
  if (
    !p.startsWith('disk:/') ||
    p.includes('\0') ||
    p.split('/').some((v) => v === '.' || v === '..')
  )
    fail(400, 'messages.invalidFolderPath');
  return p === 'disk:/' ? p : p.replace(/\/+$/, '');
}

export function inside(p: string, root: string) {
  return p === root || p.startsWith(root === 'disk:/' ? root : root + '/');
}

export async function trustedFetch(
  url: string,
  headers: Record<string, string> = {},
  depth = 0,
  signal?: AbortSignal,
): Promise<Response> {
  const u = new URL(url);
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    u.port ||
    !(
      u.hostname === 'yandex.net' ||
      u.hostname.endsWith('.yandex.net') ||
      u.hostname === 'yandex.ru' ||
      u.hostname.endsWith('.yandex.ru')
    )
  )
    fail(502, 'messages.unexpectedFileAddress');
  const r = await fetch(u, {
    headers,
    redirect: 'manual',
    cache: 'no-store',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
      : AbortSignal.timeout(60000),
  });
  if ([301, 302, 303, 307, 308].includes(r.status)) {
    await r.body?.cancel();
    if (depth >= 5) fail(502, 'messages.tooManyRedirects');
    const target = new URL(r.headers.get('location') || '', u);
    const nextHeaders = { ...headers };
    if (target.origin !== u.origin)
      for (const name of Object.keys(nextHeaders)) {
        if (name.toLowerCase() === 'authorization') delete nextHeaders[name];
      }
    return trustedFetch(target.href, nextHeaders, depth + 1, signal);
  }
  return r;
}

export async function mediaURL(m: Row, preview = false, signal?: AbortSignal) {
  if (preview) {
    const meta = (await disk(
      m.account_id,
      'resources',
      {
        path: m.path,
        preview_size: 'XL',
        preview_crop: 'false',
      },
      signal,
    )) as Resource;
    if (!meta.preview) fail(404, 'messages.noThumbnailIsAvailableForThisFile');
    return meta.preview;
  }
  const info = await disk(
    m.account_id,
    'resources/download',
    { path: m.path },
    signal,
  );
  return info.href as string;
}

export async function fetchMedia(
  m: Row,
  preview = false,
  range?: string | null,
  signal?: AbortSignal,
) {
  const link = await mediaURL(m, preview, signal);
  return fetchMediaLink(m, link, preview, range, signal);
}

async function fetchMediaLink(
  m: Row,
  link: string,
  preview: boolean,
  range?: string | null,
  signal?: AbortSignal,
) {
  const headers: Record<string, string> = range ? { Range: range } : {};
  if (preview) {
    const url = new URL(link);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !['downloader.disk.yandex.ru', 'downloader.disk.yandex.net'].includes(
        url.hostname,
      )
    )
      fail(502, 'messages.unexpectedPreviewAddress');
    headers.Authorization = 'OAuth ' + (await accountToken(m.account_id));
  }
  return trustedFetch(link, headers, 0, signal);
}

const previewLinks = new MemoryCache<string, Promise<string>>(60000, 256);

async function previewLink(m: Row, signal: AbortSignal, refresh: boolean) {
  const key = hash(
    JSON.stringify([m.account_id, m.resource_id, m.path, m.revision || '']),
  );
  if (refresh) previewLinks.delete(key);
  let pending = previewLinks.get(key);
  if (!pending) {
    // The signal belongs to the shared image job, not to an individual viewer.
    pending = mediaURL(m, true, signal);
    previewLinks.set(key, pending);
    const entry = pending;
    void pending.catch(() => {
      if (previewLinks.get(key) === entry) previewLinks.delete(key);
    });
  }
  signal.throwIfAborted();
  const result = await new Promise<string>((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    pending!
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', aborted));
  });
  return result;
}

export async function fetchPreview(
  m: Row,
  signal: AbortSignal,
  refresh = false,
) {
  let response = await fetchMediaLink(
    m,
    await previewLink(m, signal, refresh),
    true,
    null,
    signal,
  );
  if ([401, 403, 404].includes(response.status)) {
    await response.body?.cancel();
    response = await fetchMediaLink(
      m,
      await previewLink(m, signal, true),
      true,
      null,
      signal,
    );
  }
  return response;
}
