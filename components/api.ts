import { ApiError } from './feedback';
export async function api(
  path: string,
  method = 'GET',
  data?: unknown,
  signal?: AbortSignal,
) {
  const r = await fetch('/api/' + path, {
    method,
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal,
  });
  const value = await r.json();
  if (!r.ok)
    throw new ApiError(
      value.error || 'Не удалось выполнить запрос',
      value.fieldErrors || {},
      r.status,
    );
  return value;
}
