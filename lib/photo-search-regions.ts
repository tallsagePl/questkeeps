export type PhotoSearchRegion = {
  key: string;
  lat: number;
  lon: number;
  radius: number;
};

const KM_PER_LATITUDE_DEGREE = 111.32;

export const PHOTO_SEARCH_RADIUS_METERS = 1200;

// Stable cells approximately 1 km across. Every photo is at most about 710 m
// from its cell centre, leaving about 490 m of search margin in every direction.
// Distant clusters remain separate, and adding photos only loads new cells.
export function photoSearchRegions(
  photos: { lat: number; lon: number }[],
): PhotoSearchRegion[] {
  const regions = new Map<string, PhotoSearchRegion>();
  for (const photo of photos) {
    if (
      !Number.isFinite(photo.lat) ||
      !Number.isFinite(photo.lon) ||
      Math.abs(photo.lat) > 90 ||
      Math.abs(photo.lon) > 180
    )
      continue;
    const row = Math.floor(
      (Math.min(photo.lat, 89.999999) + 90) * KM_PER_LATITUDE_DEGREE,
    );
    const lat = -90 + (row + 0.5) / KM_PER_LATITUDE_DEGREE;
    const columns = Math.max(
      1,
      Math.ceil(360 * KM_PER_LATITUDE_DEGREE * Math.cos((lat * Math.PI) / 180)),
    );
    const width = 360 / columns;
    const longitude = (((photo.lon + 180) % 360) + 360) % 360;
    const col = Math.min(columns - 1, Math.floor(longitude / width));
    const lon = -180 + (col + 0.5) * width;
    const key =
      'v4:photo:' + row + ':' + col + ':' + PHOTO_SEARCH_RADIUS_METERS;
    regions.set(key, {
      key,
      lat: Number(lat.toFixed(5)),
      lon: Number(lon.toFixed(5)),
      radius: PHOTO_SEARCH_RADIUS_METERS,
    });
  }
  return [...regions.values()].sort((a, b) => a.key.localeCompare(b.key));
}
