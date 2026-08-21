export type MediaAssetType = 'image' | 'video';
export type MediaAssetStatus = 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed';

/** Device-independent media contract shared by publish and feed delivery. */
export type MediaAsset = {
  id: string;
  ownerId?: string;
  type: MediaAssetType;
  status: MediaAssetStatus;
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

export function mediaAssetSource(asset: MediaAsset): string {
  return asset.type === 'video'
    ? asset.playbackUrl || asset.canonicalUrl
    : asset.canonicalUrl;
}
