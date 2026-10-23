import {
  isTranslationKey,
  localizeMessage,
  type LocalizedMessage,
} from './translate';

export function messageDescriptor(
  value: unknown,
): LocalizedMessage | undefined {
  if (isTranslationKey(value)) return { key: value };
  if (
    value &&
    typeof value === 'object' &&
    'key' in value &&
    isTranslationKey(value.key)
  ) {
    return value as LocalizedMessage;
  }
  return undefined;
}

const storedPrefix = 'qk:message:';

export function storeMessage(message: LocalizedMessage): string {
  return message.params ? storedPrefix + JSON.stringify(message) : message.key;
}

export function readStoredMessage(value: unknown): unknown {
  if (typeof value !== 'string' || !value.startsWith(storedPrefix))
    return value;
  try {
    return (
      messageDescriptor(JSON.parse(value.slice(storedPrefix.length))) || value
    );
  } catch {
    return value;
  }
}

// Normalize application-message fields only. Never inspect titles, journal text,
// profile names, third-party prose or large nested geometry.
export function withMessageTranslations(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withMessageTranslations);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = { ...value };
  if (Array.isArray(result.sources))
    result.sources = result.sources.map((source) =>
      source && typeof source === 'object'
        ? withMessageTranslations({
            ...source,
            error: readStoredMessage(source.error),
          })
        : source,
    );
  for (const field of ['error', 'message']) {
    const descriptor = messageDescriptor(result[field]);
    if (descriptor) {
      result[field] = localizeMessage(descriptor, 'ru');
      result[field + 'Translation'] ??= descriptor;
    }
  }
  for (const field of ['fieldErrors', 'warnings']) {
    const messages = result[field];
    if (!messages || typeof messages !== 'object' || Array.isArray(messages))
      continue;
    const readable: Record<string, unknown> = { ...messages };
    const descriptors: Record<string, LocalizedMessage> = {};
    for (const [key, value] of Object.entries(messages)) {
      const descriptor = messageDescriptor(value);
      if (descriptor) {
        descriptors[key] = descriptor;
        readable[key] = localizeMessage(descriptor, 'ru');
      }
    }
    result[field] = readable;
    result[field + 'Translations'] = {
      ...descriptors,
      ...(result[field + 'Translations'] as object | undefined),
    };
  }
  return result;
}
