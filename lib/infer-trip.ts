import { routeLabel, type RouteCity } from './route-label';
import { one } from './db';
import { fail } from './access';
import { disk, normalizePath, inside, Resource } from './yandex';
import { readPhotoExif, captureDay, captureOrder } from './photo-metadata';
import {
  translate,
  type TranslationKey,
  type TranslationParams,
  type LocalizedMessage,
} from './i18n/translate';
import { closestCity } from './city-lookup';

export { closestCity } from './city-lookup';

export function ownFolder(userId: string, accountId: string, path: string) {
  if (
    !one(
      'SELECT id FROM accounts WHERE id=? AND user_id=? AND disk_enabled=1',
      accountId,
      userId,
    )
  )
    fail(403, 'messages.youDoNotHaveAccessToThisAccount');
  const folder = normalizePath(path);
  if (folder === 'disk:/') fail(400, 'messages.chooseAFolderForThisTrip');
  return folder;
}

export async function inferTrip(
  userId: string,
  input: {
    accountId: string;
    path: string;
    dates: boolean;
    destination: boolean;
    language?: 'ru' | 'en';
  },
  signal?: AbortSignal,
) {
  const folder = ownFolder(userId, input.accountId, input.path);
  const queue = [folder];
  const seen = new Set<string>();
  const seenPhotos = new Set<string>();
  const photos: {
    kind: 'photo' | 'video';
    readFailed: boolean;
    day: string | null;
    order: string;
    lat: number | null;
    lon: number | null;
  }[] = [];
  let pages = 0;
  const started = Date.now();
  while (queue.length) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    let offset = 0;
    while (true) {
      if (signal?.aborted) fail(499, 'messages.analysisCancelled');
      if (++pages > 2000 || Date.now() - started > 5 * 60000)
        fail(422, 'messages.analysisTookTooLongChooseASmaller');
      const page = (await disk(input.accountId, 'resources', {
        path,
        limit: '100',
        offset: String(offset),
        sort: 'name',
      })) as Resource;
      if (!page._embedded) fail(400, 'messages.chooseAFolderWithPhotos');
      for (const r of page._embedded.items) {
        if (signal?.aborted) fail(499, 'messages.analysisCancelled');
        if (Date.now() - started > 5 * 60000)
          fail(422, 'messages.analysisTookTooLongChooseASmaller');
        if (!inside(r.path, folder)) continue;
        if (r.type === 'dir') {
          queue.push(r.path);
          continue;
        }
        const isPhoto = !!r.mime_type?.startsWith('image/');
        const isVideo = !!r.mime_type?.startsWith('video/');
        if (!isPhoto && !(isVideo && input.dates)) continue;
        const key = r.resource_id || r.path;
        if (seenPhotos.has(key)) continue;
        seenPhotos.add(key);
        if (photos.length >= 5000)
          fail(422, 'messages.theFolderHasOver5000Photos');
        const needsExif =
          isPhoto &&
          (input.destination || (!r.exif?.date_time && !r.photoslice_time));
        const info = needsExif ? await readPhotoExif(input.accountId, r) : {};
        photos.push({
          kind: isPhoto ? 'photo' : 'video',
          readFailed: !!info.metadataReadFailed,
          day: captureDay(r, info),
          order: captureOrder(r, info),
          lat:
            typeof info.latitude === 'number' && Math.abs(info.latitude) <= 90
              ? info.latitude
              : null,
          lon:
            typeof info.longitude === 'number' &&
            Math.abs(info.longitude) <= 180
              ? info.longitude
              : null,
        });
      }
      offset += page._embedded.items.length;
      if (offset >= page._embedded.total) break;
      if (!page._embedded.items.length)
        fail(502, 'messages.driveReturnedAnIncompleteFileListTry');
    }
  }
  const days = photos
    .map((p) => p.day)
    .filter((day): day is string => !!day)
    .sort();
  const years = [...new Set(days.map((day) => day.slice(0, 4)))];
  const conflictingYears =
    years.length > 1 &&
    days.length > 1 &&
    Date.parse(days.at(-1)!) - Date.parse(days[0]) > 180 * 86400000;
  const readFailures = photos.filter((p) => p.readFailed).length;
  const geolocated = photos
    .filter((p) => p.lat !== null && p.lon !== null)
    .sort((a, b) => a.order.localeCompare(b.order));
  const route: RouteCity[] = [];
  const memo = new Map<string, ReturnType<typeof closestCity>>();
  let unmapped = 0;
  if (input.destination)
    for (const p of geolocated) {
      const key = p.lat!.toFixed(3) + ':' + p.lon!.toFixed(3);
      if (!memo.has(key)) memo.set(key, closestCity(p.lat!, p.lon!));
      const city = memo.get(key);
      if (!city) {
        unmapped++;
        continue;
      }
      const previous = route[route.length - 1];
      if (previous?.name === city.name && previous.country === city.country)
        continue;
      route.push(city);
    }
  const uniqueRoute = route.filter(
    (city, index) =>
      route.findIndex(
        (c) => c.name === city.name && c.country === city.country,
      ) === index,
  );
  const destination = routeLabel(uniqueRoute, input.language || 'ru');
  const warningsTranslations: Record<string, LocalizedMessage> = {};
  function warning(
    field: string,
    key: TranslationKey,
    params?: TranslationParams,
  ) {
    warningsTranslations[field] = { key, ...(params ? { params } : {}) };
    return translate(key, 'ru', params);
  }
  const warnings: Record<string, string> = {};
  if (!photos.length) {
    warnings.dates = warning('dates', 'messages.thereAreNoPhotosInThisFolder');
    warnings.destination = warning(
      'destination',
      'messages.thereAreNoPhotosInThisFolderEnter',
    );
  } else {
    if (conflictingYears)
      warnings.dates = warning(
        'dates',
        'messages.theFilesContainDatesFromDifferentYears',
      );
    else if (!days.length)
      warnings.dates = warning(
        'dates',
        'messages.thePhotosHaveNoCaptureDatesEnter',
      );
    else if (days.length < photos.length)
      warnings.dates = warning('dates', 'inference.partialDates', {
        dated: days.length,
        total: photos.length,
      });
    if (!geolocated.length)
      warnings.destination = readFailures
        ? warning('destination', 'messages.somePhotoMetadataCouldNotBeRead')
        : warning('destination', 'messages.thePhotosHaveNoCoordinatesEnterThe');
    else if (!destination)
      warnings.destination = warning(
        'destination',
        'messages.couldNotFindTownsNearThePhotos',
      );
    else if (
      unmapped ||
      geolocated.length < photos.length ||
      uniqueRoute.length > 5
    )
      warnings.destination = warning(
        'destination',
        'messages.destinationDetectedFromSomeGpsPhotosPlease',
      );
  }
  return {
    photoCount: photos.filter((p) => p.kind === 'photo').length,
    videoCount: photos.filter((p) => p.kind === 'video').length,
    dateYears: input.dates ? years : [],
    datedCount: days.length,
    gpsCount: geolocated.length,
    start: input.dates && !conflictingYears ? days[0] || null : null,
    end: input.dates && !conflictingYears ? days.at(-1) || null : null,
    destination: input.destination ? destination : null,
    route: input.destination ? uniqueRoute : [],
    warnings,
    warningsTranslations,
    attribution: 'GeoNames / cities.json · CC BY 4.0',
  };
}
