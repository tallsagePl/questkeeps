import english from './en.json';
export type Language = 'ru' | 'en';
const dictionary = english as Record<string, string>;
const reverse = Object.fromEntries(
  Object.entries(dictionary).map(([ru, en]) => [en, ru]),
);
export function translate(text: string, language: Language): string {
  if (!text) return text;
  const before = text.match(/^\s*/)?.[0] || '',
    after = text.match(/\s*$/)?.[0] || '';
  const value = text.trim();
  const canonical = reverse[value] || value;
  if (language === 'ru') return before + canonical + after;
  if (dictionary[canonical]) return before + dictionary[canonical] + after;
  const patterns: [RegExp, (m: RegExpMatchArray) => string][] = [
    [
      /^Даты найдены у (\d+) из (\d+) фото — проверьте период$/,
      (m) =>
        'Dates found in ' +
        m[1] +
        ' of ' +
        m[2] +
        ' photos — please check the dates',
    ],
    [/^Минимум (\d+) символов$/, (m) => 'At least ' + m[1] + ' characters'],
    [/^Обновлено (.+)$/, (m) => 'Updated ' + m[1]],
    [
      /^Синхронизация завершена: (\d+) файлов$/,
      (m) => 'Synchronization complete: ' + m[1] + ' files',
    ],
    [
      /^Яндекс Диск временно недоступен \((\d+)\)$/,
      (m) => 'Yandex Disk is temporarily unavailable (' + m[1] + ')',
    ],
    [
      /^Дата должна быть не (позже|раньше) (.+)$/,
      (m) =>
        'Date must be no ' +
        (m[1] === 'позже' ? 'later' : 'earlier') +
        ' than ' +
        m[2],
    ],
    [
      /^(Минимальное|Максимальное) значение — (.+)$/,
      (m) =>
        (m[1] === 'Минимальное' ? 'Minimum' : 'Maximum') + ' value — ' + m[2],
    ],
  ];
  for (const [pattern, replacement] of patterns) {
    const match = canonical.match(pattern);
    if (match) return before + replacement(match) + after;
  }
  return text;
}
export function currentLanguage(): Language {
  return typeof document !== 'undefined' &&
    document.documentElement.lang === 'en'
    ? 'en'
    : 'ru';
}
export const translateCurrent = (text: string) =>
  translate(text, currentLanguage());
