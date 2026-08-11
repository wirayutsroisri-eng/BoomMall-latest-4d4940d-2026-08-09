import { distanceKm } from './geo';
import {
  DEFAULT_SEARCH_RADIUS,
  resolveSearchRadiusKm,
  type SearchRadiusOption,
} from './search-radius';
import type { ExtractedJobKeywords, GeoPoint, MatchedProvider, ServiceProvider } from './types';

export { DEFAULT_SEARCH_RADIUS as DEFAULT_SEARCH_RADIUS_KM } from './search-radius';

function hasSkillOverlap(extracted: string[], providerSkills: string[]): string[] {
  const providerSet = new Set(providerSkills);
  return extracted.filter((s) => providerSet.has(s));
}

/**
 * Match active providers within radius that share at least one extracted skill.
 * Sorted nearest-first. Pass `all` / Infinity for unlimited area.
 */
export function matchProviders(
  postGps: GeoPoint,
  extracted: ExtractedJobKeywords,
  providers: ServiceProvider[],
  radiusKm: number | SearchRadiusOption = DEFAULT_SEARCH_RADIUS,
): MatchedProvider[] {
  if (extracted.skills.length === 0) return [];

  const limitKm = resolveSearchRadiusKm(
    typeof radiusKm === 'number' && !Number.isFinite(radiusKm) ? 'all' : radiusKm,
  );
  const matched: MatchedProvider[] = [];

  for (const provider of providers) {
    if (!provider.isActive) continue;
    const overlappingSkills = hasSkillOverlap(extracted.skills, provider.skills);
    if (overlappingSkills.length === 0) continue;
    const distance = distanceKm(postGps, provider.gps);
    if (Number.isFinite(limitKm) && distance > limitKm) continue;
    matched.push({ provider, distanceKm: distance, overlappingSkills });
  }

  matched.sort((a, b) => a.distanceKm - b.distanceKm);
  return matched;
}
