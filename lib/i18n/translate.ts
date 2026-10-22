import russian from './ru.json';
import english from './en.json';

export type Language = 'ru' | 'en';

export type TranslationKey = keyof typeof russian;

export type TranslationParams = Readonly<Record<string, string | number>>;

export type LocalizedMessage = {
  key: TranslationKey;
  params?: TranslationParams;
};

export type Translator = (
  key: TranslationKey,
  params?: TranslationParams,
) => string;

const dictionaries: Record<Language, Record<TranslationKey, string>> = {
  ru: russian,
  en: english,
};

export function isTranslationKey(value: unknown): value is TranslationKey {
  return typeof value === 'string' && Object.hasOwn(russian, value);
}

export function translate(
  key: TranslationKey,
  language: Language,
  params: TranslationParams = {},
): string {
  const template = dictionaries[language][key];
  if (template === undefined)
    throw new Error('Unknown translation key: ' + key);

  return template.replace(
    /\{([a-zA-Z][a-zA-Z0-9]*)\}/g,
    (_placeholder, name: string) => {
      if (!Object.hasOwn(params, name)) {
        throw new Error(
          'Missing translation parameter ' + name + ' for ' + key,
        );
      }
      return String(params[name]);
    },
  );
}

// Only application messages use this boundary. User-authored content is rendered
// directly, never looked up in a translation dictionary.
export function localizeMessage(value: unknown, language: Language): string {
  if (isTranslationKey(value)) return translate(value, language);
  if (
    value &&
    typeof value === 'object' &&
    'key' in value &&
    isTranslationKey(value.key)
  ) {
    const message = value as LocalizedMessage;
    return translate(message.key, language, message.params);
  }
  return typeof value === 'string' ? value : '';
}

export function currentLanguage(): Language {
  return typeof document !== 'undefined' &&
    document.documentElement.lang === 'en'
    ? 'en'
    : 'ru';
}

export const translateCurrent: Translator = (key, params) =>
  translate(key, currentLanguage(), params);

export const localizeCurrentMessage = (message: unknown) =>
  localizeMessage(message, currentLanguage());
