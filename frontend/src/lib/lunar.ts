/**
 * Lunar geodesy helpers. Convention (docs/scientific/02-lunar-crs.md):
 * IAU/IAG Moon sphere R = 1737.4 km (GCS_Moon_2000, IAU:30100), planetocentric
 * latitude, east-positive longitude in [-180, 180).
 */

export const MOON_RADIUS_KM = 1737.4;
export const MOON_RADIUS_M = MOON_RADIUS_KM * 1000;
export const CRS_LABEL = "GCS_Moon_2000 · IAU:30100 · R = 1737.4 km";

const RAD = Math.PI / 180;

export function normalizeLon(lon: number): number {
  if (lon >= -180 && lon < 180) return lon; // avoid float drift for in-range values
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Haversine distance on the lunar sphere (km). */
export function greatCircleKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const p1 = lat1 * RAD;
  const p2 = lat2 * RAD;
  const a =
    Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(((lon2 - lon1) * RAD) / 2) ** 2;
  return 2 * MOON_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Area of a lon/lat rectangle on the sphere (km²); handles antimeridian crossing. */
export function bboxAreaKm2(b: BBox): number {
  let width = (((b.east - b.west) % 360) + 360) % 360;
  if (width === 0 && b.east !== b.west) width = 360;
  return MOON_RADIUS_KM ** 2 * width * RAD * Math.abs(Math.sin(b.north * RAD) - Math.sin(b.south * RAD));
}

export function inBBox(lon: number, lat: number, b: BBox): boolean {
  if (lat < b.south || lat > b.north) return false;
  return b.west <= b.east ? lon >= b.west && lon <= b.east : lon >= b.west || lon <= b.east;
}

/**
 * Vertices of a small circle (crater rim) of given diameter on the sphere,
 * computed with the direct geodesic problem (exact on a sphere).
 * Returns a flat [lon0, lat0, lon1, lat1, ...] array in degrees, closed.
 */
export function craterRim(lon: number, lat: number, diameterKm: number, segments = 48): number[] {
  const delta = diameterKm / 2 / MOON_RADIUS_KM; // angular radius
  const p1 = lat * RAD;
  const l1 = lon * RAD;
  const out: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (2 * Math.PI * i) / segments;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(delta) + Math.cos(p1) * Math.sin(delta) * Math.cos(theta));
    const l2 =
      l1 +
      Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(p1), Math.cos(delta) - Math.sin(p1) * Math.sin(p2));
    out.push(l2 / RAD, p2 / RAD);
  }
  return out;
}

/** Parse "lat, lon" coordinates. Accepts N/S/E/W suffixes and 0–360 east longitudes. */
export function parseCoordinates(input: string): { lat: number; lon: number } | null {
  const parts = input
    .trim()
    .toUpperCase()
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (parts.length !== 2) return null;
  const parse = (s: string, kind: "lat" | "lon") => {
    const m = s.match(/^([+-]?\d+(?:\.\d+)?)°?([NSEW])?$/);
    if (!m) return null;
    let v = parseFloat(m[1]);
    const h = m[2];
    if (h && ((kind === "lat" && !"NS".includes(h)) || (kind === "lon" && !"EW".includes(h)))) return null;
    if (h === "S" || h === "W") v = -v;
    return v;
  };
  const lat = parse(parts[0], "lat");
  const lonRaw = parse(parts[1], "lon");
  if (lat === null || lonRaw === null || Math.abs(lat) > 90 || lonRaw < -180 || lonRaw > 360) return null;
  return { lat, lon: normalizeLon(lonRaw) };
}

export function formatLat(lat: number, digits = 3): string {
  return `${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? "N" : "S"}`;
}

export function formatLon(lon: number, digits = 3): string {
  return `${Math.abs(lon).toFixed(digits)}° ${lon >= 0 ? "E" : "W"}`;
}
