import { ApiError } from './feedback';
import { isTranslationKey, type LocalizedMessage } from '@/lib/i18n/translate';

type JsonObject = Record<string, unknown>;

// Compatibility for older callers; domain controllers supply an explicit T.
type LegacyApiResponse = Record<string, any>;

function object(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function descriptor(value: unknown): LocalizedMessage | undefined {
  return object(value) && isTranslationKey(value.key)
    ? (value as LocalizedMessage)
    : undefined;
}

function applyMessageTranslations(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(applyMessageTranslations);
  if (!object(value)) return value;
  const result: JsonObject = { ...value };
  if (Array.isArray(result.sources))
    result.sources = result.sources.map(applyMessageTranslations);
  for (const field of ['error', 'message']) {
    const message = descriptor(value[field + 'Translation']);
    if (message) result[field] = message;
  }
  for (const field of ['fieldErrors', 'warnings']) {
    const messages = value[field + 'Translations'];
    if (!object(messages)) continue;
    const fields = object(result[field]) ? { ...result[field] } : {};
    for (const [name, value] of Object.entries(messages)) {
      const message = descriptor(value);
      if (message) fields[name] = message;
    }
    result[field] = fields;
  }
  return result;
}

export async function api<T = LegacyApiResponse>(
  path: string,
  method = 'GET',
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/' + path, {
      method,
      headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal,
    });
  } catch (error) {
    if (signal?.aborted && signal.reason?.name !== 'TimeoutError') throw error;
    throw new ApiError(
      signal?.reason?.name === 'TimeoutError'
        ? 'errors.requestTimedOut'
        : 'errors.requestFailed',
    );
  }
  let value: unknown;
  try {
    value = applyMessageTranslations(await response.json());
  } catch (error) {
    if (signal?.aborted && signal.reason?.name === 'TimeoutError') {
      throw new ApiError('errors.requestTimedOut', {}, response.status);
    }
    if (
      signal?.aborted ||
      (error instanceof Error && error.name === 'AbortError')
    )
      throw error;
    throw new ApiError('errors.requestFailed', {}, response.status);
  }
  if (!response.ok) {
    const result = object(value) ? value : {};
    const message =
      descriptor(result.error) ||
      (typeof result.error === 'string'
        ? result.error
        : 'errors.requestFailed');
    const fields: Record<string, string | LocalizedMessage> = {};
    if (object(result.fieldErrors))
      for (const [key, value] of Object.entries(result.fieldErrors)) {
        const message = descriptor(value);
        if (message || typeof value === 'string')
          fields[key] = message || (value as string);
      }
    throw new ApiError(message, fields, response.status);
  }
  return value as T;
}
