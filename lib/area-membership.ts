type Coord = [number, number];

export const STREET_DISTANCE_METERS = 30;

function segmentDistance(p: Coord, a: Coord, b: Coord) {
  const k = 111320;
  const x = Math.cos((p[1] * Math.PI) / 180) * k;
  const ax = (a[0] - p[0]) * x;
  const ay = (a[1] - p[1]) * k;
  const bx = (b[0] - p[0]) * x;
  const by = (b[1] - p[1]) * k;
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(
    0,
    Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function ringContains(p: Coord, ring: Coord[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (segmentDistance(p, a, b) < 0.02) return true;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

function polygonContains(p: Coord, rings: Coord[][]) {
  return (
    !!rings[0] &&
    ringContains(p, rings[0]) &&
    !rings.slice(1).some((r) => ringContains(p, r))
  );
}

export function photoInArea(
  photo: { lat: number; lon: number },
  collection: { features: any[] },
) {
  if (!Number.isFinite(photo.lat) || !Number.isFinite(photo.lon)) return false;
  const p: Coord = [photo.lon, photo.lat];
  return collection.features.some((feature) => {
    const g = feature.geometry;
    if (g?.type === 'Polygon') return polygonContains(p, g.coordinates);
    if (g?.type === 'MultiPolygon')
      return g.coordinates.some((r: Coord[][]) => polygonContains(p, r));
    const lines =
      g?.type === 'LineString'
        ? [g.coordinates]
        : g?.type === 'MultiLineString'
          ? g.coordinates
          : [];
    return lines.some((line: Coord[]) =>
      line.some(
        (point, i) =>
          i > 0 &&
          segmentDistance(p, line[i - 1], point) <= STREET_DISTANCE_METERS,
      ),
    );
  });
}
