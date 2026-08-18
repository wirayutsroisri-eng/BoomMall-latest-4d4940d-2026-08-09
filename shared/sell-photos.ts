export const SELL_PENDING_IMAGES_KEY = "boommall_sell_pending_images";
export const SELL_PHOTOS_EVENT = "boom-mall:sell-photos";

export type PendingSellImage = {
  filename: string;
  contentType: string;
  base64: string;
  dataUrl: string;
};

type KeyValueStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export function writePendingSellImages(
  images: PendingSellImage[],
  storage: KeyValueStorage
): void {
  storage.setItem(
    SELL_PENDING_IMAGES_KEY,
    JSON.stringify(images.slice(0, 10))
  );
}

export function hasPendingSellImages(storage: KeyValueStorage): boolean {
  return Boolean(storage.getItem(SELL_PENDING_IMAGES_KEY));
}

export function takePendingSellImages(
  storage: KeyValueStorage
): PendingSellImage[] {
  try {
    const raw = storage.getItem(SELL_PENDING_IMAGES_KEY);
    storage.removeItem(SELL_PENDING_IMAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PendingSellImage =>
        !!item &&
        typeof item === "object" &&
        typeof (item as PendingSellImage).base64 === "string" &&
        typeof (item as PendingSellImage).filename === "string" &&
        typeof (item as PendingSellImage).contentType === "string"
    );
  } catch {
    return [];
  }
}
