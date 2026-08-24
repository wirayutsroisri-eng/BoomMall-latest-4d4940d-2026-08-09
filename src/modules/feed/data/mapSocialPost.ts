import type { FeedComment, FeedItem } from '../domain/types';
import type { SocialCommentDto } from './feedEngageApi';
import { inferBoardSide } from '@/modules/matching/domain/board-side';
import { isDemoCatalogFeedItem, isLiveUgcFeedItem, mediaUriLooksLive } from '../domain/isLiveUgcFeedItem';
import {
  DEFAULT_TEXT_OVERLAY_STYLE,
  type EditorMedia,
  type OverlayObject,
  type TextOverlayObject,
} from '@/modules/create/domain/editorComposition';
import { mediaAssetSource, type MediaAsset } from '@/modules/media/domain/mediaAsset';

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
  editorMedia?: EditorMedia[];
  mediaAssets?: MediaAsset[];
  overlays?: OverlayObject[];
  authorName?: string;
  authorHandle?: string;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

/**
 * A server feed response must never point at an app sandbox on one device.
 * Those URLs become unreadable after reinstall and are invalid on every other
 * device. Keep local-file support in the persisted device feed, but do not
 * treat it as portable media coming back from the backend.
 */
export function isPortableServerMediaUri(uri: string | undefined | null): uri is string {
  const value = uri?.trim() ?? '';
  return /^(https?:|data:image\/)/i.test(value);
}

function asEditorMedia(value: unknown): EditorMedia[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const media = value.filter((item): item is EditorMedia => {
    if (!item || typeof item !== 'object') return false;
    const row = item as Record<string, unknown>;
    return typeof row.id === 'string' && typeof row.uri === 'string' && (row.type === 'image' || row.type === 'video');
  });
  return media.length ? media : undefined;
}

function asMediaAssets(value: unknown): MediaAsset[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const assets = value.filter((item): item is MediaAsset => {
    if (!item || typeof item !== 'object') return false;
    const row = item as Record<string, unknown>;
    return typeof row.id === 'string'
      && (row.type === 'image' || row.type === 'video')
      && typeof row.canonicalUrl === 'string'
      && typeof row.status === 'string';
  });
  return assets.length ? assets : undefined;
}

function asOverlays(value: unknown): OverlayObject[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const overlays = value.flatMap((item): OverlayObject[] => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.mediaId !== 'string') return [];
    if (row.type === 'text' && typeof row.text === 'string') {
      const rawStyle = row.style && typeof row.style === 'object'
        ? row.style as Record<string, unknown>
        : {};
      const legacyStyle = row as Record<string, unknown>;
      return [{
        ...row,
        type: 'text',
        id: row.id,
        mediaId: row.mediaId,
        text: row.text,
        locked: typeof row.locked === 'boolean' ? row.locked : false,
        style: {
          ...DEFAULT_TEXT_OVERLAY_STYLE,
          ...rawStyle,
          color:
            typeof rawStyle.color === 'string'
              ? rawStyle.color
              : typeof legacyStyle.color === 'string'
                ? legacyStyle.color
                : DEFAULT_TEXT_OVERLAY_STYLE.color,
          backgroundColor:
            typeof rawStyle.backgroundColor === 'string'
              ? rawStyle.backgroundColor
              : typeof legacyStyle.backgroundColor === 'string'
                ? legacyStyle.backgroundColor
                : DEFAULT_TEXT_OVERLAY_STYLE.backgroundColor,
          backgroundOpacity:
            typeof rawStyle.backgroundOpacity === 'number'
              ? rawStyle.backgroundOpacity
              : typeof legacyStyle.backgroundOpacity === 'number'
                ? legacyStyle.backgroundOpacity
                : DEFAULT_TEXT_OVERLAY_STYLE.backgroundOpacity,
          fontFamily:
            typeof rawStyle.fontFamily === 'string'
              ? rawStyle.fontFamily
              : typeof legacyStyle.fontFamily === 'string'
                ? legacyStyle.fontFamily
                : undefined,
          fontWeight:
            typeof rawStyle.fontWeight === 'string'
              ? rawStyle.fontWeight
              : typeof legacyStyle.fontWeight === 'string'
                ? legacyStyle.fontWeight
                : DEFAULT_TEXT_OVERLAY_STYLE.fontWeight,
          fontSize:
            typeof rawStyle.fontSize === 'number'
              ? rawStyle.fontSize
              : typeof legacyStyle.fontSize === 'number'
                ? legacyStyle.fontSize
                : DEFAULT_TEXT_OVERLAY_STYLE.fontSize,
          strokeColor:
            typeof rawStyle.strokeColor === 'string'
              ? rawStyle.strokeColor
              : typeof legacyStyle.strokeColor === 'string'
                ? legacyStyle.strokeColor
                : DEFAULT_TEXT_OVERLAY_STYLE.strokeColor,
          strokeWidth:
            typeof rawStyle.strokeWidth === 'number'
              ? rawStyle.strokeWidth
              : typeof legacyStyle.strokeWidth === 'number'
                ? legacyStyle.strokeWidth
                : DEFAULT_TEXT_OVERLAY_STYLE.strokeWidth,
          fontKey:
            rawStyle.fontKey === 'kanit' || rawStyle.fontKey === 'mitr' || rawStyle.fontKey === 'halloween'
              ? rawStyle.fontKey
              : 'classic',
        },
      } as TextOverlayObject];
    }
    if (row.type === 'sticker' && typeof row.sticker === 'string') return [row as OverlayObject];
    return [];
  });
  return overlays.length ? overlays : undefined;
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
    editorMedia: asEditorMedia(o.editorMedia),
    mediaAssets: asMediaAssets(o.mediaAssets),
    overlays: asOverlays(o.overlays),
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
  const readyAssets = media.mediaAssets?.filter(
    (asset) => asset.status === 'ready' && isPortableServerMediaUri(mediaAssetSource(asset)),
  ) ?? [];
  const assetImages = readyAssets.filter((asset) => asset.type === 'image').map(mediaAssetSource);
  const editorImages = media.editorMedia
    ?.filter((item) => item.type === 'image' && isPortableServerMediaUri(item.uri))
    .map((item) => item.uri) ?? [];
  const portableImages = media.images.filter(isPortableServerMediaUri);
  const resolvedImages = assetImages.length ? assetImages : portableImages.length ? portableImages : editorImages;
  const imageUris = resolvedImages.length ? resolvedImages : undefined;
  const serverDeclaredMedia = media.images.length > 0 || Boolean(media.video) || Boolean(media.editorMedia?.length);
  const editorVideo = media.editorMedia
    ?.find((item) => item.type === 'video' && isPortableServerMediaUri(item.uri))
    ?.uri;
  const assetVideo = readyAssets.find((asset) => asset.type === 'video');
  const videoUri = assetVideo
    ? mediaAssetSource(assetVideo)
    : isPortableServerMediaUri(media.video) ? media.video : editorVideo;
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
    videoUri,
    mediaAssets: readyAssets.length ? readyAssets : undefined,
    mediaUnavailable: serverDeclaredMedia && !imageUris?.length && !videoUri,
    editorMedia: media.editorMedia,
    overlays: media.overlays,
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
      const existingWithComposition: FeedItem = {
        ...existing,
        editorMedia: existing.editorMedia?.length ? existing.editorMedia : item.editorMedia,
        overlays: existing.overlays?.length ? existing.overlays : item.overlays,
      };
      if (
        existingWithComposition.editorMedia !== existing.editorMedia ||
        existingWithComposition.overlays !== existing.overlays
      ) {
        byId.set(item.id, existingWithComposition);
      }
      continue;
    }
    const keepLocal =
      item.id.startsWith('feed-user-') || item.lane === 'board';
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
