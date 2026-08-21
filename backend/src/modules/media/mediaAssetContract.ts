import { AppError } from '../../lib/errors';

export type PublishedMediaAsset = {
  id: string;
  ownerId?: string;
  type: 'image' | 'video';
  status: 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed';
  storageKey?: string;
  canonicalUrl: string;
  thumbnailUrl?: string;
  playbackUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  mimeType?: string;
  fileSize?: number;
  createdAt?: string;
  updatedAt?: string;
};

const LOCAL_MEDIA_PATTERNS = [
  /^file:/i,
  /^content:/i,
  /^ph:/i,
  /^assets-library:/i,
  /^\/private\/var\//i,
  /^\/var\/mobile\//i,
  /\/Library\/(Caches|tmp)\//i,
  /\/CoreSimulator\/Devices\//i,
];

export function isForbiddenPersistentMediaSource(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const source = value.trim();
  return LOCAL_MEDIA_PATTERNS.some((pattern) => pattern.test(source));
}

export function collectMediaSources(media: unknown): string[] {
  if (typeof media === 'string') return [media];
  if (Array.isArray(media)) return media.flatMap(collectMediaSources);
  if (!media || typeof media !== 'object') return [];
  const row = media as Record<string, unknown>;
  const direct = [
    row.uri,
    row.url,
    row.video,
    row.videoUri,
    row.editedMediaUri,
    row.editedMediaURI,
    row.localWorkingUri,
    row.thumbnailUri,
    row.thumbnailUrl,
    row.playbackUri,
    row.playbackUrl,
    row.canonicalUrl,
  ]
    .filter((value): value is string => typeof value === 'string');
  return [
    ...direct,
    ...collectMediaSources(row.images),
    ...collectMediaSources(row.imageUris),
    ...collectMediaSources(row.editorMedia),
    ...collectMediaSources(row.mediaAssets),
  ];
}

export function mediaAssetIdsFromPayload(media: unknown): string[] {
  if (!media || typeof media !== 'object' || Array.isArray(media)) return [];
  const row = media as Record<string, unknown>;
  const explicit = Array.isArray(row.mediaAssetIds) ? row.mediaAssetIds : [];
  const embedded = Array.isArray(row.mediaAssets)
    ? row.mediaAssets.map((asset) => asset && typeof asset === 'object' ? (asset as Record<string, unknown>).id : null)
    : [];
  return [...new Set([...explicit, ...embedded].filter((id): id is string => typeof id === 'string' && id.length > 0))];
}

export function assertPublishMediaContract(media: unknown, options: { requireAssets: boolean }) {
  const sources = collectMediaSources(media);
  const forbidden = sources.find(isForbiddenPersistentMediaSource);
  if (forbidden) {
    throw new AppError(
      'LOCAL_MEDIA_URI_FORBIDDEN',
      'Published media must use a ready MediaAsset; local device paths cannot be persisted',
      422,
      { source: forbidden },
    );
  }
  const assetIds = mediaAssetIdsFromPayload(media);
  if (options.requireAssets && sources.length > 0 && assetIds.length === 0) {
    throw new AppError('MEDIA_ASSET_REQUIRED', 'Upload media and reference a ready MediaAsset before publishing', 422);
  }
  return assetIds;
}

export function canonicalSource(asset: PublishedMediaAsset) {
  return asset.type === 'video'
    ? asset.playbackUrl || asset.canonicalUrl
    : asset.canonicalUrl;
}

export function buildCanonicalPostMedia(media: unknown, assets: PublishedMediaAsset[]) {
  const base = media && typeof media === 'object' && !Array.isArray(media)
    ? { ...(media as Record<string, unknown>) }
    : {};
  const images = assets.filter((asset) => asset.type === 'image').map(canonicalSource);
  const video = assets.find((asset) => asset.type === 'video');
  const assetIds = new Set(assets.map((asset) => asset.id));
  const overlays = Array.isArray(base.overlays)
    ? base.overlays.filter((overlay) => {
        if (!overlay || typeof overlay !== 'object') return false;
        return assetIds.has(String((overlay as Record<string, unknown>).mediaId ?? ''));
      })
    : undefined;
  return {
    ...base,
    images,
    video: video ? canonicalSource(video) : undefined,
    mediaAssetIds: assets.map((asset) => asset.id),
    mediaAssets: assets,
    editorMedia: assets.map((asset) => ({
      id: asset.id,
      mediaAssetId: asset.id,
      uri: canonicalSource(asset),
      type: asset.type,
      width: asset.width,
      height: asset.height,
    })),
    ...(overlays ? { overlays } : {}),
  };
}
