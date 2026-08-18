import {
  takePendingSellImages as takeFromStorage,
  writePendingSellImages as writeToStorage,
  type PendingSellImage,
} from "@shared/sell-photos";
import { prepareImageForUpload } from "@/lib/imageUpload";

export {
  SELL_PENDING_IMAGES_KEY,
  SELL_PHOTOS_EVENT,
  type PendingSellImage,
} from "@shared/sell-photos";

export async function stashPendingSellImages(files: File[]): Promise<void> {
  const pending: PendingSellImage[] = [];
  for (const file of Array.from(files).slice(0, 10)) {
    const prepared = await prepareImageForUpload(file);
    pending.push({
      filename: prepared.filename,
      contentType: prepared.contentType,
      base64: prepared.base64,
      dataUrl: prepared.dataUrl,
    });
  }
  writeToStorage(pending, sessionStorage);
}

export function takePendingSellImages(): PendingSellImage[] {
  return takeFromStorage(sessionStorage);
}
