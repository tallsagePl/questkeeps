import { MemoryCache } from './memory-cache';
import {
  readSavedSearches,
  type SavedSuggestion,
} from './place-recommendation-store';
import { api } from '../components/api';
type Photo = { id: string; revision?: string; lat: number; lon: number };
const requests = new MemoryCache<
  string,
  Promise<{ suggestions: SavedSuggestion[] }>
>();
export const photoSearchKey = (photo: Photo, scope: string) =>
  scope +
  ':' +
  photo.id +
  ':' +
  photo.revision +
  ':' +
  photo.lat +
  ':' +
  photo.lon;
export async function searchPhotoPlaces(
  photo: Photo,
  scope: string,
  tripId: string,
) {
  const key = photoSearchKey(photo, scope),
    storageKey = 'questkeeps:found-places:v1:' + scope + ':' + tripId;
  try {
    const saved = readSavedSearches(
      localStorage.getItem(storageKey),
      new Set([key]),
    );
    if (saved.has(key)) return { suggestions: saved.get(key)! };
  } catch {}
  let pending = requests.get(key);
  if (!pending) {
    pending = api(
      'media/' + photo.id + '/places',
      'GET',
      undefined,
      AbortSignal.timeout(20000),
    ).then((result) => {
      try {
        const entries = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const valid = Array.isArray(entries)
          ? entries.filter((item) => Array.isArray(item) && item[0] !== key)
          : [];
        localStorage.setItem(
          storageKey,
          JSON.stringify([...valid, [key, result.suggestions]]),
        );
      } catch {}
      return result as { suggestions: SavedSuggestion[] };
    });
    requests.set(key, pending);
    void pending.catch(() => requests.delete(key));
  }
  return pending;
}
export function clearPlaceSearchRequests() {
  requests.clear();
}
