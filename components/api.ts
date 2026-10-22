import { ApiError } from './feedback';
import {
  currentLanguage,
  isTranslationKey,
  localizeMessage,
} from '@/lib/i18n/translate';

function applyMessageTranslations(value: any): any {
  if (Array.isArray(value)) return value.map(applyMessageTranslations);
  if (!value || typeof value !== 'object') return value;

  const result: Record<string, any> = { ...value };
  if (Array.isArray(result.sources)) {
    result.sources = result.sources.map(applyMessageTranslations);
  }
  for (const field of ['error', 'message']) {
    const descriptor = value[field + 'Translation'];
    if (descriptor && isTranslationKey(descriptor.key)) {
      result[field] = descriptor.params
        ? localizeMessage(descriptor, currentLanguage())
        : descriptor.key;
    }
  }
  for (const field of ['fieldErrors', 'warnings']) {
    for (const [name, descriptor] of Object.entries(
      value[field + 'Translations'] || {},
    )) {
      const message = descriptor as { key?: unknown; params?: unknown };
      if (isTranslationKey(message?.key)) {
        result[field] = {
          ...(result[field] || {}),
          [name]: message.params
            ? localizeMessage(message, currentLanguage())
            : message.key,
        };
      }
    }
  }
  return result;
}

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
  let value: any;
  try {
    value = applyMessageTranslations(await r.json());
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof Error && error.name === 'AbortError')
    )
      throw error;
    throw new ApiError('errors.requestFailed', {}, r.status);
  }
  if (!r.ok)
    throw new ApiError(
      value.error || 'errors.requestFailed',
      value.fieldErrors || {},
      r.status,
    );
  return value;
}
