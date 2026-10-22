import russian from './ru.json';
import {
  isTranslationKey,
  type LocalizedMessage,
  type TranslationKey,
} from './translate';

// Compatibility with human-readable API fields and errors already persisted in
// SQLite. This allowlist is used only on the server's application-message fields;
// titles, journal text, profile names and other user content are never inspected.
const legacyMessageKeys = new Map<string, TranslationKey>(
  Object.entries(russian).map(([key, text]) => [text, key as TranslationKey]),
);

export function messageDescriptor(
  value: unknown,
): LocalizedMessage | undefined {
  if (typeof value !== 'string') return undefined;
  const key = isTranslationKey(value) ? value : legacyMessageKeys.get(value);
  return key ? { key } : undefined;
}

export function withMessageTranslations(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withMessageTranslations);
  if (!value || typeof value !== 'object') return value;

  const result: Record<string, unknown> = { ...value };
  if (Array.isArray(result.sources)) {
    result.sources = result.sources.map(withMessageTranslations);
  }
  for (const field of ['error', 'message']) {
    const descriptor = messageDescriptor(result[field]);
    if (descriptor && !result[field + 'Translation'])
      result[field + 'Translation'] = descriptor;
  }
  for (const field of ['fieldErrors', 'warnings']) {
    const messages = result[field];
    if (!messages || typeof messages !== 'object' || Array.isArray(messages))
      continue;
    const descriptors = Object.fromEntries(
      Object.entries(messages).flatMap(([key, text]) => {
        const descriptor = messageDescriptor(text);
        return descriptor ? [[key, descriptor]] : [];
      }),
    );
    result[field + 'Translations'] = {
      ...descriptors,
      ...(result[field + 'Translations'] as object | undefined),
    };
  }
  return result;
}
