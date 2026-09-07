import type { EditorMedia } from '@/modules/create/domain/editorComposition';
import { uploadMediaAsset } from '@/modules/media/data/mediaAssetApi';
import { mediaAssetSource, type MediaAsset } from '@/modules/media/domain/mediaAsset';

export function isRemoteMediaUrl(uri: string) {
  return /^https?:\/\//i.test(uri.trim());
}

/** Copy local capture files to API/object storage so reload still has a URL. */
export async function uploadFeedMedia(input: {
  imageUris?: string[];
  videoUri?: string;
  editorMedia?: EditorMedia[];
}): Promise<{
  imageUris: string[];
  videoUri?: string;
  mediaAssets: MediaAsset[];
  bindings: { sourceUri: string; asset: MediaAsset }[];
}> {
  const descriptors = input.editorMedia ?? [];
  const mediaAssets: MediaAsset[] = [];
  const bindings: { sourceUri: string; asset: MediaAsset }[] = [];
  const imageResults: { uri: string; sourceUri?: string; asset?: MediaAsset }[] = [];
  const images = input.imageUris ?? [];
  const imageDescriptors = descriptors.filter((item) => item.type === 'image');
  // Keep memory and network pressure bounded on Android when selecting many photos.
  for (let index = 0; index < images.length; index += 1) {
    const uri = images[index];
    if (isRemoteMediaUrl(uri)) {
      imageResults.push({ uri });
      continue;
    }
    const descriptor = imageDescriptors[index];
    const asset = await uploadMediaAsset({ uri, type: 'image', width: descriptor?.width, height: descriptor?.height });
    imageResults.push({ uri: mediaAssetSource(asset), sourceUri: uri, asset });
  }
  const imageUris = imageResults.map((result) => result.uri);
  for (const result of imageResults) {
    if (!result.asset || !result.sourceUri) continue;
    mediaAssets.push(result.asset);
    bindings.push({ sourceUri: result.sourceUri, asset: result.asset });
  }
  let videoUri = input.videoUri;
  if (videoUri && !isRemoteMediaUrl(videoUri)) {
    const descriptor = descriptors.find((item) => item.type === 'video');
    const asset = await uploadMediaAsset({ uri: videoUri, type: 'video', width: descriptor?.width, height: descriptor?.height });
    mediaAssets.push(asset);
    bindings.push({ sourceUri: input.videoUri!, asset });
    videoUri = mediaAssetSource(asset);
  }
  return { imageUris, videoUri, mediaAssets, bindings };
}
