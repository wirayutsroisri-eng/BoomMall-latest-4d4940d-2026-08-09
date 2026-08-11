import type { GeoPoint } from './types';

/** Chanthaburi town center — default post GPS for mock matching. */
export const CHANTHABURI: GeoPoint = { lat: 12.6114, lng: 102.1039 };

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in kilometres (Haversine). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Offset a point by approximate km north / east (local flat Earth). */
export function offsetKm(origin: GeoPoint, northKm: number, eastKm: number): GeoPoint {
  const dLat = northKm / 111.32;
  const dLng = eastKm / (111.32 * Math.cos(toRad(origin.lat)));
  return { lat: origin.lat + dLat, lng: origin.lng + dLng };
}
