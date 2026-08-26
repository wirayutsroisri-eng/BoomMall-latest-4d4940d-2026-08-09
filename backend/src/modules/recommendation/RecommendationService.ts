import { prisma } from '../../lib/prisma';
import { getInterestProfile } from './InterestProfileService';
import { getRecommendationConfig } from './RecommendationConfigService';
import { rankCandidates, type MatchCandidate } from './RankingService';
import { rewriteMediaUrls } from '../media/publicMediaUrl';

export type RecommendationSurface = 'feed' | 'products' | 'secondhand' | 'jobs' | 'services';

function words(value: string) {
  return value.normalize('NFKC').split(/[\s,;#|/]+/).map((v) => v.trim()).filter((v) => v.length > 1);
}

function metaTags(meta: unknown) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return [];
  const row = meta as Record<string, unknown>;
  return ['category', 'subcategory', 'contentType', 'sellerType', 'priceRange', 'keywords', 'tags']
    .flatMap((key) => Array.isArray(row[key]) ? (row[key] as unknown[]).map(String) : row[key] ? [String(row[key])] : []);
}

async function candidates(surface: RecommendationSurface, take: number): Promise<MatchCandidate[]> {
  if (surface === 'products' || surface === 'services') {
    const rows = await prisma.catalogItem.findMany({ where: { status: 'ACTIVE', kind: surface === 'services' ? 'SERVICE' : 'PRODUCT' }, orderBy: { updatedAt: 'desc' }, take });
    return rows.map((row) => ({ id: row.id, tags: [...words(`${row.title} ${row.description ?? ''}`), ...metaTags(row.metadataJson)],
      createdAt: row.createdAt, popularity: row.isPromoted ? 0.7 : 0.2, payload: row }));
  }
  const lane = surface === 'secondhand' ? { in: ['secondhand', 'marketplace'] } : surface === 'jobs' ? { in: ['job', 'jobs'] } : undefined;
  const rows = await prisma.socialPost.findMany({ where: { status: 'ACTIVE', ...(lane ? { lane } : {}) }, orderBy: { createdAt: 'desc' }, take });
  return rows.map((row) => ({ id: row.id, tags: [...words(row.body), ...(Array.isArray(row.tagsJson) ? row.tagsJson.map(String) : [])],
    location: row.locationLabel, createdAt: row.createdAt,
    popularity: Math.min(1, (row.likeCount + row.commentCount * 2 + row.shareCount * 3) / 1000), payload: {
      id: row.id, authorId: row.authorId, body: row.body, media: rewriteMediaUrls(row.mediaJson), status: row.status,
      likeCount: row.likeCount, commentCount: row.commentCount, shareCount: row.shareCount,
      lat: row.lat, lng: row.lng, locationLabel: row.locationLabel,
      tags: Array.isArray(row.tagsJson) ? row.tagsJson.map(String) : [], lane: row.lane,
      createdAt: row.createdAt.toISOString(),
    } }));
}

export async function getRecommendations(userId: string, surface: RecommendationSurface, input: { limit?: number; cursor?: string }) {
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  const [profile, config, rows] = await Promise.all([getInterestProfile(userId), getRecommendationConfig(), candidates(surface, 300)]);
  const ranked = rankCandidates(profile, rows, config);
  const offset = input.cursor ? Math.max(0, Number(Buffer.from(input.cursor, 'base64url').toString('utf8')) || 0) : 0;
  const page = ranked.slice(offset, offset + limit);
  return {
    items: page.map(({ candidate }) => candidate.payload),
    nextCursor: offset + limit < ranked.length ? Buffer.from(String(offset + limit)).toString('base64url') : null,
  };
}

export async function calculateMatchScoreForContent(userId: string, contentId: string, surface: RecommendationSurface = 'feed') {
  const [profile, config, rows] = await Promise.all([getInterestProfile(userId), getRecommendationConfig(), candidates(surface, 300)]);
  const found = rankCandidates(profile, rows.filter((row) => row.id === contentId), config)[0];
  return found?.match ?? null;
}
