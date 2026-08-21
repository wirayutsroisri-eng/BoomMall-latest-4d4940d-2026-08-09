/**
 * Social feed posts — durable on PostgreSQL (Redis for Socket.io fan-out).
 * Spec suggested MongoDB; BoomMall keeps one relational store for audit/moderation.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { attachMediaAssetsToPost, readyMediaAssetsForPublish } from '../media/MediaAssetService';
import { assertPublishMediaContract, buildCanonicalPostMedia } from '../media/mediaAssetContract';

export type SocialPostDto = {
  id: string;
  authorId: string;
  authorName?: string | null;
  authorHandle?: string | null;
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
};

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
}): Promise<SocialPostDto> {
  const body = input.body.trim();
  if (!input.authorId || !body) throw new AppError('VALIDATION', 'authorId and body required', 400);
  if (body.length > 4000) throw new AppError('VALIDATION', 'body too long', 400);
  const lane = ['nearby', 'following', 'foryou', 'board'].includes(String(input.lane ?? ''))
    ? String(input.lane)
    : 'foryou';
  const tags = Array.isArray(input.tags) ? input.tags.map(String).slice(0, 12) : [];
  const mediaAssetIds = assertPublishMediaContract(input.media, { requireAssets: true });
  const readyAssets = await readyMediaAssetsForPublish(input.authorId, mediaAssetIds);
  const publishMedia = readyAssets.length ? buildCanonicalPostMedia(input.media, readyAssets) : input.media;

  if (await prismaReady()) {
    const row = await prisma.socialPost.create({
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
    await attachMediaAssetsToPost(input.authorId, mediaAssetIds, row.id);
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
  },
): Promise<SocialPostDto[]> {
  const take = Math.min(limit, 100);
  let likedIds = new Set<string>();
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
  }

  if (await prismaReady()) {
    const rows = await prisma.socialPost.findMany({
      where: {
        ...(opts?.includeHidden ? {} : { status: 'ACTIVE' }),
        ...(opts?.authorIds?.length ? { authorId: { in: opts.authorIds } } : {}),
        ...(opts?.lane ? { lane: opts.lane } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: opts?.nearby ? Math.min(take * 4, 200) : take,
    });
    let mapped = rows.map((row) => ({ ...mapPost(row), liked: likedIds.has(row.id) }));
    try {
      const authorIds = [...new Set(mapped.map((p) => p.authorId))];
      const profiles = await prisma.userProfile.findMany({
        where: { userId: { in: authorIds } },
        select: { userId: true, displayName: true, handle: true },
      });
      const byUser = new Map(profiles.map((p) => [p.userId, p]));
      mapped = mapped.map((p) => {
        const profile = byUser.get(p.authorId);
        return {
          ...p,
          authorName: profile?.displayName ?? p.authorName,
          authorHandle: profile?.handle ?? p.authorHandle,
        };
      });
    } catch {
      /* author snapshot in mediaJson is enough */
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

  return readStore()
    .posts.filter((p) => (opts?.includeHidden ? true : p.status === 'ACTIVE'))
    .filter((p) => (opts?.authorIds?.length ? opts.authorIds.includes(p.authorId) : true))
    .filter((p) => (opts?.lane ? p.lane === opts.lane : true))
    .filter((p) => {
      if (!opts?.nearby || p.lat == null || p.lng == null) return !opts?.nearby;
      return haversineKm(opts.nearby, { lat: p.lat, lng: p.lng }) <= (opts.nearby.radiusKm ?? 10);
    })
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

type SignalKind = 'like' | 'unlike' | 'not_interested' | 'share';
type SignalStore = { signals: Array<{ id: string; kind: SignalKind; contentId: string; at: string }> };
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
  if (!['like', 'unlike', 'not_interested', 'share'].includes(input.kind)) {
    throw new AppError('VALIDATION', 'kind must be like | unlike | not_interested | share', 400);
  }
  const store = readSignals();
  store.signals.unshift({
    id: randomUUID(),
    kind: input.kind,
    contentId,
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
  createdAt: Date;
}): SocialPostDto {
  const media = row.mediaJson;
  const blob = media && typeof media === 'object' && !Array.isArray(media) ? (media as Record<string, unknown>) : {};
  return {
    id: row.id,
    authorId: row.authorId,
    authorName: typeof blob.authorName === 'string' ? blob.authorName : null,
    authorHandle: typeof blob.authorHandle === 'string' ? blob.authorHandle : null,
    body: row.body,
    media: row.mediaJson,
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
