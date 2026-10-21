import { placeAreaKind } from './place-kind';
export type PlaceCategory =
  'attraction' | 'street' | 'district' | 'square' | 'park';
export function placeCategory(place: {
  title: string;
  summary?: string;
  kind?: string;
}): PlaceCategory {
  const title = place.title
    .normalize('NFD')
    .replace(/\u0301/g, '')
    .normalize('NFC')
    .toLowerCase();
  const summary = (place.summary || '')
    .normalize('NFD')
    .replace(/\u0301/g, '')
    .normalize('NFC')
    .toLowerCase();
  const definition =
    summary.split(/\s[—–]\s/)[1] ||
    summary.split(/\bis (?:an? )?/).at(-1) ||
    '';
  if (
    /^(?:парк|сад|сквер)(?:\s|$)|\((?:парк|сад)\)|\b(?:park|gardens?)$/.test(
      title,
    ) ||
    /^(?:(?:городской|общественный|исторический|ботанический|public|urban|historic|botanical)\s+){0,3}(?:парк|сад|сквер|park|garden)(?:\s|[,.]|$)/.test(
      definition,
    )
  )
    return 'park';
  if (
    /^площадь |\(площадь\)|\bsquare$/.test(title) ||
    /^(?:(?:городская|историческая|центральная|public|historic|central)\s+){0,3}(?:площадь|square)(?:[ ,.]|$)/.test(
      definition,
    )
  )
    return 'square';
  return place.kind === 'street' || place.kind === 'district'
    ? place.kind
    : placeAreaKind(place.title, place.summary || '') || 'attraction';
}
