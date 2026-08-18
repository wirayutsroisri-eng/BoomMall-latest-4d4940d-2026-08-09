export const SELL_PENDING_MEDIA_KEY = "boommall_sell_pending_media";
/** @deprecated use SELL_PENDING_MEDIA_KEY */
export const SELL_PENDING_IMAGES_KEY = "boommall_sell_pending_images";
export const SELL_MEDIA_EVENT = "boom-mall:sell-media";
/** @deprecated use SELL_MEDIA_EVENT */
export const SELL_PHOTOS_EVENT = SELL_MEDIA_EVENT;

export type PendingSellImage = {
  filename: string;
  contentType: string;
  base64: string;
  dataUrl: string;
};

export type PendingSellVideo = {
  filename: string;
  contentType: string;
  base64: string;
};

export type PendingSellMedia = {
  images: PendingSellImage[];
  video: PendingSellVideo | null;
};

type KeyValueStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export function writePendingSellMedia(
  media: PendingSellMedia,
  storage: KeyValueStorage
): void {
  storage.setItem(
    SELL_PENDING_MEDIA_KEY,
    JSON.stringify({
      images: media.images.slice(0, 10),
      video: media.video,
    })
  );
  storage.removeItem(SELL_PENDING_IMAGES_KEY);
}

export function hasPendingSellMedia(storage: KeyValueStorage): boolean {
  return Boolean(
    storage.getItem(SELL_PENDING_MEDIA_KEY) ??
      storage.getItem(SELL_PENDING_IMAGES_KEY)
  );
}

export function takePendingSellMedia(
  storage: KeyValueStorage
): PendingSellMedia {
  const rawMedia = storage.getItem(SELL_PENDING_MEDIA_KEY);
  if (rawMedia) {
    const parsed = readPendingSellMedia(rawMedia);
    storage.removeItem(SELL_PENDING_MEDIA_KEY);
    return parsed;
  }

  const legacyImages = takeLegacyPendingImages(storage);
  return { images: legacyImages, video: null };
}

function readPendingSellMedia(raw: string | null): PendingSellMedia {
  if (!raw) return { images: [], video: null };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { images: [], video: null };
    }
    const record = parsed as {
      images?: unknown;
      video?: unknown;
    };
    const images = Array.isArray(record.images)
      ? record.images.filter(isPendingSellImage)
      : [];
    const video = isPendingSellVideo(record.video) ? record.video : null;
    return { images, video };
  } catch {
    return { images: [], video: null };
  }
}

function takeLegacyPendingImages(
  storage: KeyValueStorage
): PendingSellImage[] {
  try {
    const raw = storage.getItem(SELL_PENDING_IMAGES_KEY);
    storage.removeItem(SELL_PENDING_IMAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPendingSellImage);
  } catch {
    return [];
  }
}

function isPendingSellImage(item: unknown): item is PendingSellImage {
  return (
    !!item &&
    typeof item === "object" &&
    typeof (item as PendingSellImage).base64 === "string" &&
    typeof (item as PendingSellImage).filename === "string" &&
    typeof (item as PendingSellImage).contentType === "string"
  );
}

function isPendingSellVideo(item: unknown): item is PendingSellVideo {
  return (
    !!item &&
    typeof item === "object" &&
    typeof (item as PendingSellVideo).base64 === "string" &&
    typeof (item as PendingSellVideo).filename === "string" &&
    typeof (item as PendingSellVideo).contentType === "string"
  );
}

export function splitMediaFiles(files: File[]): {
  images: File[];
  videos: File[];
} {
  const images: File[] = [];
  const videos: File[] = [];
  for (const file of files) {
    if (file.type.startsWith("video/")) videos.push(file);
    else if (file.type.startsWith("image/")) images.push(file);
  }
  return { images, videos: videos.slice(0, 1) };
}
