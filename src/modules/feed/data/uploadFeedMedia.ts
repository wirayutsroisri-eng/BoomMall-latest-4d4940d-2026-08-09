import { isRemoteMediaUrl, prepareChatMedia } from '@/modules/chat/data/chatMedia';

async function toRemote(uri: string): Promise<string> {
  if (!uri || isRemoteMediaUrl(uri)) return uri;
  const uploaded = await prepareChatMedia(uri);
  return uploaded.url || uri;
}

/** Copy local capture files to API/object storage so reload still has a URL. */
export async function uploadFeedMedia(input: {
  imageUris?: string[];
  videoUri?: string;
}): Promise<{ imageUris: string[]; videoUri?: string }> {
  const imageUris: string[] = [];
  for (const uri of input.imageUris ?? []) {
    try {
      imageUris.push(await toRemote(uri));
    } catch {
      imageUris.push(uri);
    }
  }
  let videoUri = input.videoUri;
  if (videoUri) {
    try {
      videoUri = await toRemote(videoUri);
    } catch {
      /* keep local file so this device can still play it */
    }
  }
  return { imageUris, videoUri };
}
