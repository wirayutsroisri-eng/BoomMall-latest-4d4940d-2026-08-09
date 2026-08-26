import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { attachMediaAssetToStory, readyMediaAssetsForPublish } from '../media/MediaAssetService';
import { snowflakeIdForApi } from '../../config/snowflake';

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;

function publishedOverlays(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const overlay = item as Record<string, unknown>;
    if ((overlay.type !== 'text' && overlay.type !== 'emoji') || typeof overlay.value !== 'string') return [];
    const value = overlay.value.trim().slice(0, 120);
    if (!value) return [];
    const finite = (input: unknown, fallback: number, min: number, max: number) =>
      typeof input === 'number' && Number.isFinite(input) ? Math.min(max, Math.max(min, input)) : fallback;
    return [{
      id: typeof overlay.id === 'string' ? overlay.id.slice(0, 100) : `story-overlay-${Date.now()}`,
      type: overlay.type,
      value,
      color: typeof overlay.color === 'string' ? overlay.color.slice(0, 32) : '#FFFFFF',
      fontSize: finite(overlay.fontSize, 30, 10, 96),
      x: finite(overlay.x, 0, -2000, 2000),
      y: finite(overlay.y, 0, -2000, 2000),
      scale: finite(overlay.scale, 1, 0.25, 5),
      rotation: finite(overlay.rotation, 0, -Math.PI * 2, Math.PI * 2),
    }];
  }).slice(0, 50);
}

function storyDto(row: any, viewerId?: string) {
  return {
    id: row.id,
    snowflakeId: snowflakeIdForApi(row.snowflakeId),
    userId: row.userId,
    mediaType: String(row.mediaType).toLowerCase(),
    mediaUrl: row.mediaUrl,
    thumbnailUrl: row.thumbnailUrl ?? undefined,
    caption: row.caption ?? undefined,
    overlayJson: publishedOverlays(row.overlayJson),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    status: row.status,
    viewCount: row.viewCount,
    viewed: viewerId ? row.views?.some((view: { viewerId: string }) => view.viewerId === viewerId) ?? false : false,
    user: row.user ?? undefined,
  };
}

export async function createStory(userId: string, input: {
  mediaAssetId: string;
  thumbnailAssetId?: string;
  caption?: string;
  overlayJson?: unknown;
}) {
  const assetIds = [input.mediaAssetId, input.thumbnailAssetId].filter((id): id is string => Boolean(id));
  const [asset, thumbnail] = await readyMediaAssetsForPublish(userId, assetIds);
  if (!asset) throw new AppError('MEDIA_ASSET_NOT_READY', 'Story media is not ready', 422);
  if (thumbnail && thumbnail.type !== 'image') {
    throw new AppError('STORY_THUMBNAIL_INVALID', 'Story thumbnail must be an image', 422);
  }
  const createdAt = new Date();
  const row = await prisma.story.create({
    data: {
      userId,
      mediaType: asset.type.toUpperCase() as 'IMAGE' | 'VIDEO',
      mediaUrl: asset.playbackUrl || asset.canonicalUrl,
      thumbnailUrl: thumbnail?.canonicalUrl || asset.thumbnailUrl,
      caption: input.caption?.trim().slice(0, 500) || null,
      overlayJson: publishedOverlays(input.overlayJson) as any,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + STORY_LIFETIME_MS),
    },
  });
  await attachMediaAssetToStory(userId, asset.id, row.id);
  if (thumbnail) await attachMediaAssetToStory(userId, thumbnail.id, row.id);
  return storyDto(row, userId);
}

export async function listStoryFeed(viewerId: string) {
  const now = new Date();
  const rows = await prisma.story.findMany({
    where: { status: 'ACTIVE', expiresAt: { gt: now } },
    include: { views: { where: { viewerId }, select: { viewerId: true } } },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  const profiles = await prisma.userProfile.findMany({
    where: { userId: { in: [...new Set(rows.map((row) => row.userId))] } },
    select: { userId: true, displayName: true, handle: true, avatarUrl: true },
  });
  const profileById = new Map(profiles.map((profile) => [profile.userId, profile]));
  return rows.map((row) => storyDto({ ...row, user: profileById.get(row.userId) }, viewerId));
}

export async function listUserStories(userId: string, viewerId: string) {
  const rows = await prisma.story.findMany({
    where: { userId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
    include: { views: { where: { viewerId }, select: { viewerId: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => storyDto(row, viewerId));
}

export async function markStoryViewed(storyId: string, viewerId: string) {
  const story = await prisma.story.findFirst({ where: { id: storyId, status: 'ACTIVE', expiresAt: { gt: new Date() } } });
  if (!story) throw new AppError('STORY_NOT_FOUND', 'Story not found or expired', 404);
  const result = await prisma.storyView.createMany({ data: [{ storyId, viewerId }], skipDuplicates: true });
  if (result.count) await prisma.story.update({ where: { id: storyId }, data: { viewCount: { increment: 1 } } });
  return { id: storyId, viewed: true };
}

export async function deleteStory(storyId: string, userId: string) {
  const result = await prisma.story.updateMany({ where: { id: storyId, userId, status: 'ACTIVE' }, data: { status: 'DELETED' } });
  return result.count > 0;
}
