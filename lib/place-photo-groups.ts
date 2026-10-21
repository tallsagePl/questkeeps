import { includesDate } from './date-selection';
type Photo = {
  id: string;
  kind: string;
  taken: string;
  hidden?: boolean | number;
  missing?: boolean | number;
};
type Association = { url: string; media_id: string; day: string };
export function groupPlacePhotos<T extends Photo>(
  media: T[],
  places: Association[],
  range: string,
): Map<string, T[]> {
  const available = new Map(
    media
      .filter(
        (photo) =>
          photo.kind === 'photo' &&
          !photo.hidden &&
          !photo.missing &&
          includesDate(photo.taken, range),
      )
      .map((photo) => [photo.id, photo]),
  );
  const groups = new Map<string, Map<string, T>>();
  for (const place of places) {
    const photo = available.get(place.media_id);
    if (!photo || !includesDate(place.day, range)) continue;
    if (!groups.has(place.url)) groups.set(place.url, new Map());
    groups.get(place.url)!.set(photo.id, photo);
  }
  return new Map(
    [...groups].map(([url, photos]) => [
      url,
      [...photos.values()].sort(
        (a, b) => a.taken.localeCompare(b.taken) || a.id.localeCompare(b.id),
      ),
    ]),
  );
}
