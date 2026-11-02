type Coord = [number, number];

const bounds = new WeakMap<object, [number, number, number, number]>();

function nearBounds(p: Coord, g: any) {
  if (!g || !Array.isArray(g.coordinates)) return false;
  let box = bounds.get(g);
  if (!box) {
    box = [Infinity, Infinity, -Infinity, -Infinity];
    const visit = (v: any) => {
      if (
        Array.isArray(v) &&
        typeof v[0] === 'number' &&
        typeof v[1] === 'number'
      ) {
        box![0] = Math.min(box![0], v[0]);
        box![1] = Math.min(box![1], v[1]);
        box![2] = Math.max(box![2], v[0]);
        box![3] = Math.max(box![3], v[1]);
      } else if (Array.isArray(v)) for (const child of v) visit(child);
    };
    visit(g.coordinates);
    bounds.set(g, box);
  }
  if (box[2] - box[0] > 180 || Math.abs(p[1]) > 89) return true;
  const dy = STREET_DISTANCE_METERS / 111320;
  const dx = dy / Math.max(0.001, Math.cos((p[1] * Math.PI) / 180));
  return (
    p[0] >= box[0] - dx &&
    p[0] <= box[2] + dx &&
    p[1] >= box[1] - dy &&
    p[1] <= box[3] + dy
  );
}

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
    if (!nearBounds(p, g)) return false;
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
