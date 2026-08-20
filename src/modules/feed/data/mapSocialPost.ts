import type { FeedComment, FeedItem } from '../domain/types';
import type { SocialCommentDto } from './feedEngageApi';
import { inferBoardSide } from '@/modules/matching/domain/board-side';
import { isDemoCatalogFeedItem, isLiveUgcFeedItem, mediaUriLooksLive } from '../domain/isLiveUgcFeedItem';

export type SocialPostDto = {
  id: string;
  authorId: string;
  authorName?: string | null;
  authorHandle?: string | null;
  body: string;
  media: unknown;
  status: string;
  likeCount: number;
  commentCount?: number;
  shareCount?: number;
  lat?: number | null;
  lng?: number | null;
  locationLabel?: string | null;
  tags?: string[];
  lane?: string;
  createdAt?: string;
  liked?: boolean;
};

type MediaBlob = {
  images: string[];
  video?: string;
  musicTitle?: string;
  overlayText?: string;
  overlayTextColor?: string;
  overlayTransform?: FeedItem['overlayTransform'];
  authorName?: string;
  authorHandle?: string;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

export function normalizePostMedia(media: unknown): MediaBlob {
  if (Array.isArray(media)) {
    const urls = asStringArray(media);
    const video = urls.find((u) => /\.(mp4|mov|m4v)(\?|$)/i.test(u));
    return { images: urls.filter((u) => u !== video), video };
  }
  if (!media || typeof media !== 'object') return { images: [] };
  const o = media as Record<string, unknown>;
  const images = asStringArray(o.images ?? o.imageUris);
  const video = typeof o.video === 'string' ? o.video : typeof o.videoUri === 'string' ? o.videoUri : undefined;
  return {
    images,
    video,
    musicTitle: typeof o.musicTitle === 'string' ? o.musicTitle : undefined,
    overlayText: typeof o.overlayText === 'string' ? o.overlayText : undefined,
    overlayTextColor: typeof o.overlayTextColor === 'string' ? o.overlayTextColor : undefined,
    overlayTransform:
      o.overlayTransform && typeof o.overlayTransform === 'object'
        ? (o.overlayTransform as FeedItem['overlayTransform'])
        : undefined,
    authorName: typeof o.authorName === 'string' ? o.authorName : undefined,
    authorHandle: typeof o.authorHandle === 'string' ? o.authorHandle : undefined,
  };
}

export function socialPostToFeedItem(
  post: SocialPostDto,
  opts?: { myUserId?: string; myHandle?: string },
): FeedItem {
  const media = normalizePostMedia(post.media);
  const handle = (post.authorHandle || media.authorHandle || post.authorId || 'user').replace(/^@/, '');
  const author = post.authorName || media.authorName || handle;
  const mine =
    Boolean(opts?.myUserId && post.authorId === opts.myUserId) ||
    Boolean(opts?.myHandle && handle.toLowerCase() === opts.myHandle.replace(/^@/, '').toLowerCase());
  const imageUris = media.images.length ? media.images : undefined;
  const lane = (['nearby', 'following', 'foryou', 'board'].includes(String(post.lane ?? ''))
    ? post.lane
    : 'foryou') as FeedItem['lane'];
  const tags = Array.isArray(post.tags) ? post.tags.map(String) : [];
  const boardSide =
    lane === 'board' || tags.includes('เว็บบอร์ด')
      ? inferBoardSide(post.body || '', tags)
      : undefined;
  return {
    id: post.id,
    author,
    authorHandle: handle.startsWith('@') ? handle : `@${handle}`,
    authorId: post.authorId,
    lane,
    boardSide,
    caption: post.body || 'โพสต์จาก BoomMall',
    location: post.locationLabel || 'จันทบุรี',
    gps:
      post.lat != null && post.lng != null
        ? { lat: post.lat, lng: post.lng }
        : undefined,
    likes: post.likeCount ?? 0,
    comments: post.commentCount ?? 0,
    shares: post.shareCount ?? 0,
    isLive: false,
    musicTitle: media.musicTitle?.trim() || '',
    gradient: ['#0B3D2E', '#1A7A55'],
    liked: post.liked,
    imageUri: imageUris?.[0],
    imageUris,
    videoUri: media.video,
    overlayText: media.overlayText,
    overlayTextColor: media.overlayTextColor,
    overlayTransform: media.overlayTransform,
    isUserPost: mine,
    product: {
      id: `p-${post.id}`,
      name: post.body.slice(0, 40) || 'โพสต์',
      shopName: author,
      tier: 'C2C',
      basePrice: 0,
      currency: 'THB',
      tags: tags.length ? tags : ['New'],
      variants: [{ id: 'v1', label: 'มาตรฐาน', price: 0, stock: 0 }],
    },
  };
}

export function mergeFeedItems(remote: FeedItem[], local: FeedItem[]): FeedItem[] {
  const byId = new Map<string, FeedItem>();
  for (const item of remote) {
    if (isLiveUgcFeedItem(item)) byId.set(item.id, item);
  }
  for (const item of local) {
    if (isDemoCatalogFeedItem(item)) continue;
    const existing = byId.get(item.id);
    if (existing) {
      const remoteHasMedia = mediaUriLooksLive(existing.imageUri) || mediaUriLooksLive(existing.videoUri);
      const localHasMedia = mediaUriLooksLive(item.imageUri) || mediaUriLooksLive(item.videoUri);
      if (!remoteHasMedia && localHasMedia) {
        byId.set(item.id, {
          ...existing,
          ...item,
          isUserPost: Boolean(existing.isUserPost || item.isUserPost),
        });
      }
      continue;
    }
    const keepLocal =
      item.isUserPost || item.id.startsWith('feed-user-') || item.lane === 'board';
    if (!keepLocal) continue;
    if (item.lane === 'board' || isLiveUgcFeedItem(item)) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => {
    const aUser = Number(Boolean(a.isUserPost));
    const bUser = Number(Boolean(b.isUserPost));
    if (aUser !== bUser) return bUser - aUser;
    return b.id.localeCompare(a.id);
  });
}

function formatCommentTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'เมื่อสักครู่';
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 60_000) return 'เมื่อสักครู่';
  if (diffMs < 3_600_000) return `${Math.max(1, Math.floor(diffMs / 60_000))} นาทีที่แล้ว`;
  if (diffMs < 86_400_000) return `${Math.max(1, Math.floor(diffMs / 3_600_000))} ชม.ที่แล้ว`;
  return d.toLocaleDateString('th-TH');
}

export function socialCommentToFeedComment(
  dto: SocialCommentDto,
  feedId: string,
  opts?: { myUserId?: string; myDisplayName?: string },
): FeedComment {
  const mine = Boolean(opts?.myUserId && dto.authorId === opts.myUserId);
  const handle = (dto.authorHandle || dto.authorId || 'user').replace(/^@/, '');
  const author =
    (mine && opts?.myDisplayName?.trim()) ||
    dto.authorName?.trim() ||
    handle ||
    'ผู้ใช้';
  return {
    id: dto.id,
    feedId,
    author,
    authorInitial: author.slice(0, 1) || '?',
    authorId: dto.authorId,
    text: dto.body,
    likes: dto.likeCount ?? 0,
    createdAt: formatCommentTime(dto.createdAt),
    parentId: dto.parentId ?? undefined,
  };
}
