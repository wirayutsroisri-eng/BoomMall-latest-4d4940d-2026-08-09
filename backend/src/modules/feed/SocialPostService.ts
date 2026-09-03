/**
 * Social feed posts — durable on PostgreSQL (Redis for Socket.io fan-out).
 * Spec suggested MongoDB; BoomMall keeps one relational store for audit/moderation.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { guardUserContent } from './moderation/guardUserContent';
import {
  attachProductsToPost,
  listPostProductsForPosts,
  normalizePostProductInput,
  type PostProductDto,
} from './PostProductService';
import { attachMediaAssetsToPost, readyMediaAssetsForPublish } from '../media/MediaAssetService';
import { assertPublishMediaContract, buildCanonicalPostMedia } from '../media/mediaAssetContract';
import { mediaStorageProvider } from '../media/storage';
import { currentMediaUrl, rewriteMediaUrls } from '../media/publicMediaUrl';
import { snowflakeIdForApi } from '../../config/snowflake';

export type SocialPostDto = {
  id: string;
  snowflakeId?: string;
  authorId: string;
  authorName?: string | null;
  authorHandle?: string | null;
  authorAvatarUrl?: string | null;
  body: string;
  media: unknown;
  status: string;
  likeCount: number;
  reportCount: number;
  commentCount: number;
  shareCount: number;
  lat?: number | null;
  lng?: number | null;
  locationLabel?: string | null;
  tags: string[];
  linkUrl?: string | null;
  lane: string;
  createdAt: string;
  liked?: boolean;
  saved?: boolean;
  /** Products pinned to this post — live price/stock, never a copy. */
  products?: PostProductDto[];
  productCount?: number;
  /** Share lineage — a plain post is its own root. */
  rootPostId?: string | null;
  sharedPostId?: string | null;
  shareKind?: string | null;
};

export type SecondhandListingStatus = 'ACTIVE' | 'RESERVED' | 'SOLD' | 'HIDDEN' | 'REMOVED' | 'EXPIRED';

export async function updateSecondhandListingStatus(postId: string, authorId: string, status: SecondhandListingStatus) {
  const allowed: SecondhandListingStatus[] = ['ACTIVE', 'RESERVED', 'SOLD', 'HIDDEN', 'REMOVED', 'EXPIRED'];
  if (!allowed.includes(status)) throw new AppError('VALIDATION', 'invalid listing status', 400);
  if (await prismaReady()) {
    const existing = await prisma.socialPost.findUnique({ where: { id: postId } });
    if (!existing || existing.authorId !== authorId) return null;
    return mapPost(await prisma.socialPost.update({ where: { id: postId }, data: { status } }));
  }
  const store = readStore();
  const index = store.posts.findIndex((post) => post.id === postId && post.authorId === authorId);
  if (index < 0) return null;
  store.posts[index] = { ...store.posts[index]!, status };
  writeStore(store);
  return store.posts[index]!;
}

type Store = { posts: SocialPostDto[] };
const DATA_FILE = path.join(process.cwd(), 'data', 'social-posts.json');

function readStore(): Store {
  try {
    if (!fs.existsSync(DATA_FILE)) return { posts: [] };
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Store;
  } catch {
    return { posts: [] };
  }
}

function writeStore(s: Store) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(s, null, 2), 'utf8');
}

async function prismaReady() {
  try {
    await prisma.socialPost.findFirst({ take: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function createSocialPost(input: {
  authorId: string;
  body: string;
  media?: unknown;
  lat?: number;
  lng?: number;
  locationLabel?: string;
  tags?: string[];
  linkUrl?: string;
  lane?: string;
  /** ปักตะกร้า — real catalog products the author owns. */
  products?: unknown;
}): Promise<SocialPostDto> {
  const body = input.body.trim();
  if (!input.authorId || !body) throw new AppError('VALIDATION', 'authorId and body required', 400);
  if (body.length > 4000) throw new AppError('VALIDATION', 'body too long', 400);
  // Apple 1.2: objectionable material is filtered before it reaches the feed.
  await guardUserContent({ text: body, authorId: input.authorId, entityType: 'POST' });
  const lane = ['nearby', 'following', 'foryou', 'board'].includes(String(input.lane ?? ''))
    ? String(input.lane)
    : 'foryou';
  const tags = Array.isArray(input.tags) ? input.tags.map(String).slice(0, 12) : [];
  const clientPostId = input.media && typeof input.media === 'object' && !Array.isArray(input.media)
    ? String((input.media as Record<string, unknown>).clientPostId ?? '').trim()
    : '';
  const mediaAssetIds = assertPublishMediaContract(input.media, { requireAssets: true });
  const readyAssets = await readyMediaAssetsForPublish(input.authorId, mediaAssetIds);
  const publishMedia = readyAssets.length ? buildCanonicalPostMedia(input.media, readyAssets) : input.media;

  if (await prismaReady()) {
    if (clientPostId) {
      const existing = await prisma.socialPost.findFirst({
        where: {
          authorId: input.authorId,
          mediaJson: { path: ['clientPostId'], equals: clientPostId },
        },
      });
      if (existing) return mapPost(existing);
    }
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.socialPost.create({
        data: {
          id: randomUUID(),
          authorId: input.authorId,
          body,
          mediaJson: (publishMedia as object) ?? [],
          lat: input.lat,
          lng: input.lng,
          locationLabel: input.locationLabel,
          tagsJson: tags,
          linkUrl: input.linkUrl,
          lane,
        },
      });
      console.info('[POST_FLOW] database post created', { postId: created.id });
      if (mediaAssetIds.length) {
        await tx.mediaAsset.updateMany({
          where: { id: { in: mediaAssetIds }, ownerId: input.authorId, status: 'READY' },
          data: { postId: created.id },
        });
      }
      const pinned = normalizePostProductInput(input.products);
      if (pinned.length) {
        // Silently drops products the author does not own — a pin can never
        // point at someone else's shop.
        await attachProductsToPost({
          postId: created.id,
          authorId: input.authorId,
          products: pinned,
          tx,
        });
      }
      return created;
    });
    console.info('[POST_FLOW] database transaction success', { postId: row.id });
    return mapPost(row);
  }

  const dto: SocialPostDto = {
    id: randomUUID(),
    authorId: input.authorId,
    body,
    media: publishMedia ?? [],
    status: 'ACTIVE',
    likeCount: 0,
    reportCount: 0,
    commentCount: 0,
    shareCount: 0,
    lat: input.lat,
    lng: input.lng,
    locationLabel: input.locationLabel,
    tags,
    linkUrl: input.linkUrl,
    lane,
    createdAt: new Date().toISOString(),
  };
  const store = readStore();
  if (clientPostId) {
    const existing = store.posts.find((post) => {
      const media = post.media;
      return media && typeof media === 'object' && !Array.isArray(media)
        && (media as Record<string, unknown>).clientPostId === clientPostId
        && post.authorId === input.authorId;
    });
    if (existing) return existing;
  }
  store.posts.unshift(dto);
  writeStore(store);
  return dto;
}

export async function updateSocialPost(
  postId: string,
  authorId: string,
  input: {
    body?: string;
    media?: unknown;
    lat?: number;
    lng?: number;
    locationLabel?: string;
    tags?: string[];
    linkUrl?: string | null;
    lane?: string;
  },
): Promise<SocialPostDto | null> {
  const id = postId.trim();
  if (!id || !authorId) throw new AppError('VALIDATION', 'postId and authorId required', 400);
  const body = input.body?.trim();
  if (body != null && !body) throw new AppError('VALIDATION', 'body required', 400);
  if (body != null && body.length > 4000) throw new AppError('VALIDATION', 'body too long', 400);
  const lane =
    input.lane != null && ['nearby', 'following', 'foryou', 'board'].includes(String(input.lane))
      ? String(input.lane)
      : undefined;
  const tags = input.tags != null ? input.tags.map(String).slice(0, 12) : undefined;
  const mediaAssetIds = input.media != null
    ? assertPublishMediaContract(input.media, { requireAssets: false })
    : [];
  const readyAssets = await readyMediaAssetsForPublish(authorId, mediaAssetIds);
  const publishMedia = readyAssets.length ? buildCanonicalPostMedia(input.media, readyAssets) : input.media;

  if (await prismaReady()) {
    const existing = await prisma.socialPost.findUnique({ where: { id } });
    if (!existing || existing.authorId !== authorId) return null;
    const row = await prisma.socialPost.update({
      where: { id },
      data: {
        ...(body != null ? { body } : {}),
        ...(publishMedia != null ? { mediaJson: publishMedia as object } : {}),
        ...(input.lat != null ? { lat: input.lat } : {}),
        ...(input.lng != null ? { lng: input.lng } : {}),
        ...(input.locationLabel != null ? { locationLabel: input.locationLabel } : {}),
        ...(tags != null ? { tagsJson: tags } : {}),
        ...(input.linkUrl !== undefined ? { linkUrl: input.linkUrl } : {}),
        ...(lane != null ? { lane } : {}),
      },
    });
    await attachMediaAssetsToPost(authorId, mediaAssetIds, row.id);
    return mapPost(row);
  }

  const store = readStore();
  const idx = store.posts.findIndex((p) => p.id === id && p.authorId === authorId);
  if (idx < 0) return null;
  const prev = store.posts[idx];
  store.posts[idx] = {
    ...prev,
    ...(body != null ? { body } : {}),
    ...(publishMedia != null ? { media: publishMedia } : {}),
    ...(input.lat != null ? { lat: input.lat } : {}),
    ...(input.lng != null ? { lng: input.lng } : {}),
    ...(input.locationLabel != null ? { locationLabel: input.locationLabel } : {}),
    ...(tags != null ? { tags } : {}),
    ...(input.linkUrl !== undefined ? { linkUrl: input.linkUrl } : {}),
    ...(lane != null ? { lane } : {}),
  };
  writeStore(store);
  return store.posts[idx];
}

export async function deleteSocialPost(postId: string, authorId: string): Promise<boolean> {
  const id = postId.trim();
  if (!id || !authorId) throw new AppError('VALIDATION', 'postId and authorId required', 400);

  if (await prismaReady()) {
    const existing = await prisma.socialPost.findUnique({ where: { id } });
    if (!existing || existing.authorId !== authorId) return false;
    await prisma.socialPost.update({
      where: { id },
      data: { status: 'REMOVED' },
    });
    const assets = (await prisma.mediaAsset?.findMany({
      where: { postId: id, storyId: null },
      select: { id: true, storageKey: true },
    })) ?? [];
    const removedAssetIds: string[] = [];
    for (const asset of assets) {
      try {
        await mediaStorageProvider().remove(asset.storageKey);
        removedAssetIds.push(asset.id);
      } catch (error) {
        console.error('[MEDIA_CLEANUP_ERROR]', {
          postId: id,
          storageKey: asset.storageKey,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (removedAssetIds.length) {
      await prisma.mediaAsset?.deleteMany({ where: { id: { in: removedAssetIds }, postId: id, storyId: null } });
    }
    return true;
  }

  const store = readStore();
  const idx = store.posts.findIndex((p) => p.id === id && p.authorId === authorId);
  if (idx < 0) return false;
  store.posts[idx] = { ...store.posts[idx], status: 'REMOVED' };
  writeStore(store);
  return true;
}

function asTags(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export async function listSocialPosts(
  limit = 40,
  opts?: {
    includeHidden?: boolean;
    authorIds?: string[];
    nearby?: { lat: number; lng: number; radiusKm?: number };
    lane?: string;
    viewerId?: string;
    excludeIds?: string[];
  },
): Promise<SocialPostDto[]> {
  const take = Math.min(limit, 100);
  let likedIds = new Set<string>();
  let savedIds = new Set<string>();
  let hiddenIds = new Set<string>();
  let blockedCreatorIds = new Set<string>();
  const tagInterest = new Map<string, number>();
  const creatorInterest = new Map<string, number>();
  if (opts?.viewerId && (await prismaReady())) {
    try {
      const likes = await prisma.socialLike.findMany({
        where: { userId: opts.viewerId },
        select: { postId: true },
        take: 500,
      });
      likedIds = new Set(likes.map((l) => l.postId));
    } catch {
      likedIds = new Set();
    }
    try {
      const actions = await prisma.analyticsEvent.findMany({
        where: {
          userId: opts.viewerId,
          entityType: 'POST',
          name: { in: ['CONTENT_SAVE', 'CONTENT_UNSAVE', 'CONTENT_HIDE', 'CONTENT_UNHIDE'] },
        },
        select: { name: true, entityId: true },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      });
      const saveState = new Map<string, boolean>();
      const hideState = new Map<string, boolean>();
      for (const action of actions) {
        if (!action.entityId) continue;
        if ((action.name === 'CONTENT_SAVE' || action.name === 'CONTENT_UNSAVE') && !saveState.has(action.entityId)) {
          saveState.set(action.entityId, action.name === 'CONTENT_SAVE');
        }
        if ((action.name === 'CONTENT_HIDE' || action.name === 'CONTENT_UNHIDE') && !hideState.has(action.entityId)) {
          hideState.set(action.entityId, action.name === 'CONTENT_HIDE');
        }
      }
      savedIds = new Set([...saveState].filter(([, saved]) => saved).map(([id]) => id));
      hiddenIds = new Set([...hideState].filter(([, hidden]) => hidden).map(([id]) => id));
    } catch {
      savedIds = new Set();
      hiddenIds = new Set();
    }
    try {
      const blocks = await prisma.analyticsEvent.findMany({
        where: {
          userId: opts.viewerId,
          entityType: 'USER',
          name: { in: ['CONTENT_BLOCK_USER', 'CONTENT_UNBLOCK_USER'] },
        },
        select: { name: true, entityId: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      const state = new Map<string, boolean>();
      for (const action of blocks) {
        if (!action.entityId || state.has(action.entityId)) continue;
        state.set(action.entityId, action.name === 'CONTENT_BLOCK_USER');
      }
      blockedCreatorIds = new Set([...state].filter(([, blocked]) => blocked).map(([id]) => id));
    } catch {
      blockedCreatorIds = new Set();
    }
    try {
      const preferences = await prisma.analyticsEvent.findMany({
        where: {
          userId: opts.viewerId,
          name: { in: ['CONTENT_INTERESTED', 'CONTENT_NOT_INTERESTED'] },
          entityType: 'POST',
        },
        select: { name: true, payloadJson: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      for (const event of preferences) {
        const payload = event.payloadJson && typeof event.payloadJson === 'object' && !Array.isArray(event.payloadJson)
          ? event.payloadJson as Record<string, unknown>
          : {};
        const delta = event.name === 'CONTENT_INTERESTED' ? 1 : -1;
        const creator = typeof payload.creator === 'string' ? payload.creator : '';
        if (creator) creatorInterest.set(creator, (creatorInterest.get(creator) ?? 0) + delta);
        const tags = Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is string => typeof tag === 'string') : [];
        for (const tag of tags) tagInterest.set(tag, (tagInterest.get(tag) ?? 0) + delta);
      }
    } catch {
      // Chronological ordering remains the fallback when analytics is offline.
    }
  }

  if (await prismaReady()) {
    const rows = await prisma.socialPost.findMany({
      where: {
        ...(opts?.includeHidden ? {} : { status: 'ACTIVE' }),
        ...(opts?.authorIds?.length ? { authorId: { in: opts.authorIds } } : {}),
        ...(opts?.lane ? { lane: opts.lane } : {}),
        ...(opts?.excludeIds?.length ? { id: { notIn: opts.excludeIds } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: opts?.nearby ? Math.min(take * 4, 200) : take,
    });
    let mapped = rows
      .filter((row) => !hiddenIds.has(row.id) && !blockedCreatorIds.has(row.authorId))
      .map((row) => ({ ...mapPost(row), liked: likedIds.has(row.id), saved: savedIds.has(row.id) }));
    try {
      const authorIds = [...new Set(mapped.map((p) => p.authorId))];
      const profiles = await prisma.userProfile.findMany({
        where: { userId: { in: authorIds } },
        select: { userId: true, displayName: true, handle: true, avatarUrl: true },
      });
      const byUser = new Map(profiles.map((p) => [p.userId, p]));
      mapped = mapped.map((p) => {
        const profile = byUser.get(p.authorId);
        return {
          ...p,
          authorName: profile?.displayName ?? p.authorName,
          authorHandle: profile?.handle ?? p.authorHandle,
          authorAvatarUrl: currentMediaUrl(profile?.avatarUrl ?? p.authorAvatarUrl),
        };
      });
    } catch {
      /* author snapshot in mediaJson is enough */
    }
    // Shoppable posts: attach live catalog data in one round trip per page.
    const shoppableIds = rows.filter((row) => (row.productCount ?? 0) > 0).map((row) => row.id);
    if (shoppableIds.length) {
      const byPost = await listPostProductsForPosts(shoppableIds);
      mapped = mapped.map((post) =>
        byPost.has(post.id) ? { ...post, products: byPost.get(post.id) } : post,
      );
    }

    if (tagInterest.size || creatorInterest.size) {
      mapped = mapped
        .map((post, index) => ({
          post,
          index,
          score: (creatorInterest.get(post.authorId) ?? 0)
            + post.tags.reduce((sum, tag) => sum + (tagInterest.get(tag) ?? 0), 0),
        }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map(({ post }) => post);
    }
    if (opts?.nearby) {
      const radius = opts.nearby.radiusKm ?? 10;
      mapped = mapped
        .filter((p) => p.lat != null && p.lng != null)
        .filter((p) => haversineKm(opts.nearby!, { lat: p.lat!, lng: p.lng! }) <= radius)
        .slice(0, take);
    }
    return mapped;
  }

  const fallbackRows = readStore()
    .posts.filter((p) => (opts?.includeHidden ? true : p.status === 'ACTIVE'))
    .filter((p) => (opts?.authorIds?.length ? opts.authorIds.includes(p.authorId) : true))
    .filter((p) => (opts?.lane ? p.lane === opts.lane : true))
    .filter((p) => (opts?.excludeIds?.length ? !opts.excludeIds.includes(p.id) : true))
    .filter((p) => {
      if (!opts?.nearby || p.lat == null || p.lng == null) return !opts?.nearby;
      return haversineKm(opts.nearby, { lat: p.lat, lng: p.lng }) <= (opts.nearby.radiusKm ?? 10);
    });
  if (!opts?.viewerId) return fallbackRows.slice(0, take);
  const latest = new Map<string, SignalKind>();
  const blockedFallback = new Map<string, boolean>();
  for (const signal of readSignals().signals) {
    if (signal.userId !== opts.viewerId) continue;
    if ((signal.kind === 'block_user' || signal.kind === 'unblock_user') && !blockedFallback.has(signal.contentId)) {
      blockedFallback.set(signal.contentId, signal.kind === 'block_user');
      continue;
    }
    if (latest.has(signal.contentId)) continue;
    if (['save', 'unsave', 'hide', 'unhide'].includes(signal.kind)) latest.set(signal.contentId, signal.kind);
  }
  return fallbackRows
    .filter((post) => blockedFallback.get(post.authorId) !== true)
    .filter((post) => latest.get(post.id) !== 'hide')
    .map((post) => ({ ...post, saved: latest.get(post.id) === 'save' }))
    .slice(0, take);
}

export async function toggleSocialPostLike(
  id: string,
  liked: boolean,
  userId?: string,
): Promise<SocialPostDto | null> {
  if (await prismaReady() && userId) {
    try {
      const existing = await prisma.socialLike.findUnique({
        where: { userId_postId: { userId, postId: id } },
      });
      if (liked && !existing) {
        await prisma.socialLike.create({ data: { id: randomUUID(), userId, postId: id } });
        const row = await prisma.socialPost.update({
          where: { id },
          data: { likeCount: { increment: 1 } },
        });
        return { ...mapPost(row), liked: true };
      }
      if (!liked && existing) {
        await prisma.socialLike.delete({ where: { id: existing.id } });
        const row = await prisma.socialPost.update({
          where: { id },
          data: { likeCount: { decrement: 1 } },
        });
        if (row.likeCount < 0) {
          const fixed = await prisma.socialPost.update({ where: { id }, data: { likeCount: 0 } });
          return { ...mapPost(fixed), liked: false };
        }
        return { ...mapPost(row), liked: false };
      }
      const row = await prisma.socialPost.findUnique({ where: { id } });
      return row ? { ...mapPost(row), liked: Boolean(existing) } : null;
    } catch {
      /* fall through to counter-only for mock ids */
    }
  }
  const delta = liked ? 1 : -1;
  if (await prismaReady()) {
    try {
      const row = await prisma.socialPost.update({
        where: { id },
        data: { likeCount: { increment: delta } },
      });
      if (row.likeCount < 0) {
        const fixed = await prisma.socialPost.update({
          where: { id },
          data: { likeCount: 0 },
        });
        return mapPost(fixed);
      }
      return mapPost(row);
    } catch {
      return null;
    }
  }
  const store = readStore();
  const idx = store.posts.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  store.posts[idx] = {
    ...store.posts[idx],
    likeCount: Math.max(0, store.posts[idx].likeCount + delta),
  };
  writeStore(store);
  return store.posts[idx];
}

export async function bumpShareCount(id: string) {
  if (await prismaReady()) {
    try {
      const row = await prisma.socialPost.update({
        where: { id },
        data: { shareCount: { increment: 1 } },
      });
      return mapPost(row);
    } catch {
      return null;
    }
  }
  const store = readStore();
  const idx = store.posts.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  store.posts[idx] = { ...store.posts[idx], shareCount: (store.posts[idx].shareCount ?? 0) + 1 };
  writeStore(store);
  return store.posts[idx];
}

export async function bumpSocialPostReport(id: string): Promise<void> {
  if (await prismaReady()) {
    try {
      await prisma.socialPost.update({
        where: { id },
        data: { reportCount: { increment: 1 } },
      });
      return;
    } catch {
      /* local feed ids are not SocialPost rows */
    }
  }
  const store = readStore();
  const idx = store.posts.findIndex((p) => p.id === id);
  if (idx < 0) return;
  store.posts[idx] = { ...store.posts[idx], reportCount: store.posts[idx].reportCount + 1 };
  writeStore(store);
}

type SignalKind = 'like' | 'unlike' | 'interested' | 'not_interested' | 'share' | 'save' | 'unsave' | 'hide' | 'unhide' | 'block_user' | 'unblock_user';
type SignalStore = { signals: Array<{ id: string; kind: SignalKind; contentId: string; userId?: string; at: string }> };
const SIGNAL_FILE = path.join(process.cwd(), 'data', 'feed-signals.json');

function readSignals(): SignalStore {
  try {
    if (!fs.existsSync(SIGNAL_FILE)) return { signals: [] };
    return JSON.parse(fs.readFileSync(SIGNAL_FILE, 'utf8')) as SignalStore;
  } catch {
    return { signals: [] };
  }
}

export async function recordFeedSignal(input: {
  kind: SignalKind;
  contentId: string;
  userId?: string;
}) {
  const contentId = input.contentId.trim();
  if (!contentId) throw new AppError('VALIDATION', 'contentId required', 400);
  if (!['like', 'unlike', 'interested', 'not_interested', 'share', 'save', 'unsave', 'hide', 'unhide', 'block_user', 'unblock_user'].includes(input.kind)) {
    throw new AppError('VALIDATION', 'unsupported feed signal kind', 400);
  }
  if (input.userId && (await prismaReady())) {
    try {
      const isUserAction = input.kind === 'block_user' || input.kind === 'unblock_user';
      const post = isUserAction ? null : await prisma.socialPost.findUnique({
        where: { id: contentId },
        select: { authorId: true, tagsJson: true, lane: true },
      });
      await prisma.analyticsEvent.create({
        data: {
          userId: input.userId,
          name: `CONTENT_${input.kind.toUpperCase()}`,
          entityType: isUserAction ? 'USER' : 'POST',
          entityId: contentId,
          payloadJson: {
            creator: post?.authorId ?? null,
            category: post?.lane ?? 'feed',
            tags: post?.tagsJson ?? [],
          },
        },
      });
      const behaviorType: Partial<Record<SignalKind, string>> = {
        like: 'CONTENT_LIKED', interested: 'CONTENT_LIKED', share: 'CONTENT_SHARED', save: 'LISTING_SAVED',
        not_interested: 'CONTENT_HIDDEN', hide: 'CONTENT_HIDDEN', block_user: 'CREATOR_BLOCKED',
      };
      const eventType = behaviorType[input.kind];
      if (eventType) {
        const { recordBehaviorEvent } = await import('../recommendation/BehaviorEventService');
        await recordBehaviorEvent(input.userId, {
          eventType, contentId, contentType: 'CONTENT', tags: post?.tagsJson ?? [],
          metadata: { creatorId: post?.authorId, lane: post?.lane },
        });
      }
    } catch {
      // The durable local signal log remains the development fallback.
    }
  }
  const store = readSignals();
  store.signals.unshift({
    id: randomUUID(),
    kind: input.kind,
    contentId,
    userId: input.userId,
    at: new Date().toISOString(),
  });
  store.signals = store.signals.slice(0, 2000);
  const dir = path.dirname(SIGNAL_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SIGNAL_FILE, JSON.stringify(store, null, 2), 'utf8');
  return { ok: true as const, kind: input.kind, contentId };
}

function mapPost(row: {
  id: string;
  snowflakeId?: bigint | null;
  authorId: string;
  body: string;
  mediaJson: unknown;
  status: string;
  likeCount: number;
  reportCount: number;
  commentCount?: number;
  shareCount?: number;
  lat?: number | null;
  lng?: number | null;
  locationLabel?: string | null;
  tagsJson?: unknown;
  linkUrl?: string | null;
  lane?: string;
  productCount?: number;
  rootPostId?: string | null;
  sharedPostId?: string | null;
  shareKind?: string | null;
  createdAt: Date;
}): SocialPostDto {
  const media = row.mediaJson;
  const blob = media && typeof media === 'object' && !Array.isArray(media) ? (media as Record<string, unknown>) : {};
  return {
    id: row.id,
    snowflakeId: snowflakeIdForApi(row.snowflakeId),
    authorId: row.authorId,
    authorName: typeof blob.authorName === 'string' ? blob.authorName : null,
    authorHandle: typeof blob.authorHandle === 'string' ? blob.authorHandle : null,
    body: row.body,
    media: rewriteMediaUrls(row.mediaJson),
    status: row.status,
    likeCount: row.likeCount,
    reportCount: row.reportCount,
    commentCount: row.commentCount ?? 0,
    shareCount: row.shareCount ?? 0,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    locationLabel: row.locationLabel ?? null,
    tags: asTags(row.tagsJson),
    linkUrl: row.linkUrl ?? null,
    lane: row.lane ?? 'foryou',
    productCount: row.productCount ?? 0,
    rootPostId: row.rootPostId ?? row.id,
    sharedPostId: row.sharedPostId ?? null,
    shareKind: row.shareKind ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function socialFeedDomainExtras() {
  const posts = await listSocialPosts(5);
  return {
    storage: 'postgresql',
    mongoDeferred: true,
    note: 'Chat history + social posts on Postgres; Socket.io + Redis for realtime',
    recentPostCountSample: posts.length,
  };
}
