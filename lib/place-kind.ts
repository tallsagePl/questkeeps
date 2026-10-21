export type PlaceAreaKind = 'street' | 'district';
export function placeAreaKind(
  title: string,
  summary: string,
): PlaceAreaKind | null {
  const name = title.toLowerCase().replace(/́/g, ''),
    text = summary.toLowerCase().replace(/́/g, '');
  const street =
    /^(?:улица|проспект|бульвар|набережная)\b|(?:проспект|бульвар|набережная|street|avenue|boulevard)\s*(?:\([^)]*\))?$/u;
  if (
    street.test(name) ||
    /^(?:улица|проспект|бульвар|набережная) /u.test(name)
  )
    return 'street';
  if (/(?:^площадь |\(площадь\)| square$)/u.test(name)) return 'district';
  const definition = text.split(/[—–]/, 2)[1]?.trim() || text;
  if (
    /^(?:(?:исторический|городской|старый|центральный|пешеходный|небольшой|один из старейших)\s+){0,4}(?:район|квартал|площадь|улица|проспект|бульвар|набережная)(?:[ ,.—]|$)/u.test(
      definition,
    )
  )
    return /^(?:(?:исторический|городской|старый|центральный|пешеходный|небольшой)\s+){0,4}(?:улица|проспект|бульвар|набережная)/u.test(
      definition,
    )
      ? 'street'
      : 'district';
  if (/^(?:улица|проспект|бульвар|набережная) /u.test(text)) return 'street';
  if (/^(?:площадь|район|квартал) /u.test(text)) return 'district';
  const english = text.split(/\bis (?:an? )?/).at(-1) || '';
  if (
    /^(?:(?:historic|historical|pedestrian|central|old)\s+){0,3}(?:street|avenue|boulevard)\b/.test(
      english,
    )
  )
    return 'street';
  if (
    /^(?:(?:historic|historical|central|old)\s+){0,3}(?:district|quarter|neighbourhood|neighborhood|square)\b/.test(
      english,
    )
  )
    return 'district';
  return null;
}
export const isAreaPlace = (title: string, summary: string) =>
  placeAreaKind(title, summary) !== null;
