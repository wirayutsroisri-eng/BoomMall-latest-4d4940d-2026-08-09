/** Preferred matching radius set on post / service listing creation. */
export type SearchRadiusOption = 3 | 5 | 10 | 25 | 50 | 'all';

export type SearchRadiusChoice = {
  value: SearchRadiusOption;
  label: string;
};

export const DEFAULT_SEARCH_RADIUS: SearchRadiusOption = 10;

/** Sentinel for "All Area" — no distance cap. */
export const ALL_AREA_RADIUS_KM = Number.POSITIVE_INFINITY;

export const SEARCH_RADIUS_OPTIONS: SearchRadiusChoice[] = [
  { value: 3, label: '3 กม.' },
  { value: 5, label: '5 กม.' },
  { value: 10, label: '10 กม.' },
  { value: 25, label: '25 กม.' },
  { value: 50, label: '50 กม.' },
  { value: 'all', label: 'ทั้งพื้นที่' },
];

/** Resolve UI option → km used by the match engine. Default 10 km. */
export function resolveSearchRadiusKm(
  value?: SearchRadiusOption | number | null,
): number {
  if (value === 'all') return ALL_AREA_RADIUS_KM;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  return 10;
}

export function formatSearchRadiusLabel(value?: SearchRadiusOption | number | null): string {
  if (value === 'all') return 'ทั้งพื้นที่';
  const km = resolveSearchRadiusKm(value);
  if (!Number.isFinite(km)) return 'ทั้งพื้นที่';
  return `${km} กม.`;
}
