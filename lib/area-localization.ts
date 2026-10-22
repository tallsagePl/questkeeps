// Deterministic display transcription; identifiers and source URLs keep their original spelling.
const turkishLetters: Record<string, string> = {
  a: 'а',
  b: 'б',
  c: 'дж',
  ç: 'ч',
  d: 'д',
  e: 'е',
  f: 'ф',
  g: 'г',
  ğ: 'г',
  h: 'х',
  ı: 'ы',
  i: 'и',
  j: 'ж',
  k: 'к',
  l: 'л',
  m: 'м',
  n: 'н',
  o: 'о',
  ö: 'ё',
  p: 'п',
  q: 'к',
  r: 'р',
  s: 'с',
  ş: 'ш',
  t: 'т',
  u: 'у',
  ü: 'ю',
  v: 'в',
  w: 'в',
  x: 'кс',
  y: 'й',
  z: 'з',
};

export function russianAreaTitle(source: string, country = '') {
  const original = source.trim();
  if (/[А-Яа-яЁё]/.test(original)) return original;
  if (
    country !== 'TR' &&
    !/[çğıöşüİ]/i.test(original) &&
    !/\b(?:mahallesi|mah\.?|caddesi|cad\.?|sokağı|sokak|sok\.?)$/i.test(
      original,
    )
  )
    return original;
  const name = original.replace(
    /\s+(?:mahallesi|mah\.?|caddesi|cad\.?|sokağı|sokak|sok\.?)$/i,
    '',
  );
  return name.replace(/[A-Za-zÇĞİÖŞÜçğıöşü]+/g, (word) => {
    const result = [...word.toLocaleLowerCase('tr')]
      .map((char) => turkishLetters[char] || char)
      .join('');
    return /^[A-ZÇĞİÖŞÜ]/.test(word)
      ? result.charAt(0).toUpperCase() + result.slice(1)
      : result;
  });
}

export function russianAreaDescription(
  title: string,
  kind: 'street' | 'district',
) {
  return (kind === 'street' ? 'Улица ' : 'Городской район ') + title + '.';
}

export const russianText = (value: unknown): value is string =>
  typeof value === 'string' && /[А-Яа-яЁё]/.test(value);
