import {
  MAX_VIDEO_UPLOAD_BYTES,
  formatUploadLimit,
} from "@shared/upload-limits";
import {
  splitMediaFiles,
  takePendingSellMedia as takeFromStorage,
  writePendingSellMedia,
  type PendingSellMedia,
  type PendingSellImage,
  type PendingSellVideo,
} from "@shared/sell-media";
import { fileToBase64Raw, prepareImageForUpload, ImageUploadError } from "@/lib/imageUpload";

export {
  SELL_PENDING_MEDIA_KEY,
  SELL_PENDING_IMAGES_KEY,
  SELL_MEDIA_EVENT,
  SELL_PHOTOS_EVENT,
  type PendingSellMedia,
  type PendingSellImage,
  type PendingSellVideo,
} from "@shared/sell-media";

export class SellMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SellMediaError";
  }
}

export async function stashPendingSellMedia(files: File[]): Promise<void> {
  const { images, videos } = splitMediaFiles(files);
  const pendingImages: PendingSellImage[] = [];

  for (const file of images.slice(0, 10)) {
    const prepared = await prepareImageForUpload(file);
    pendingImages.push({
      filename: prepared.filename,
      contentType: prepared.contentType,
      base64: prepared.base64,
      dataUrl: prepared.dataUrl,
    });
  }

  let pendingVideo: PendingSellVideo | null = null;
  const videoFile = videos[0];
  if (videoFile) {
    if (videoFile.size > MAX_VIDEO_UPLOAD_BYTES) {
      throw new SellMediaError(
        `วิดีโอใหญ่เกินไป (สูงสุด ${formatUploadLimit(MAX_VIDEO_UPLOAD_BYTES)})`
      );
    }
    pendingVideo = {
      filename: videoFile.name,
      contentType: videoFile.type || "video/mp4",
      base64: await fileToBase64Raw(videoFile),
    };
  }

  if (!pendingImages.length && !pendingVideo) {
    throw new SellMediaError("กรุณาเลือกรูปภาพหรือวิดีโอ");
  }

  writePendingSellMedia({ images: pendingImages, video: pendingVideo }, sessionStorage);
}

export function takePendingSellMedia(): PendingSellMedia {
  return takeFromStorage(sessionStorage);
}

export { splitMediaFiles };
