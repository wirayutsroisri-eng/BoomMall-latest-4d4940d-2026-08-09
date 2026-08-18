import { describe, expect, it } from "vitest";
import {
  SELL_PENDING_MEDIA_KEY,
  hasPendingSellMedia,
  splitMediaFiles,
  takePendingSellMedia,
  writePendingSellMedia,
} from "@shared/sell-media";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

describe("pending sell media", () => {
  it("stores then consumes photos and video once", () => {
    const storage = memoryStorage();
    writePendingSellMedia(
      {
        images: [
          {
            filename: "shoe.jpg",
            contentType: "image/jpeg",
            base64: "abc",
            dataUrl: "data:image/jpeg;base64,abc",
          },
        ],
        video: {
          filename: "clip.mp4",
          contentType: "video/mp4",
          base64: "vid",
        },
      },
      storage
    );

    expect(hasPendingSellMedia(storage)).toBe(true);
    const first = takePendingSellMedia(storage);
    expect(first.images).toHaveLength(1);
    expect(first.video?.filename).toBe("clip.mp4");
    expect(takePendingSellMedia(storage)).toEqual({ images: [], video: null });
  });

  it("caps photos at 10", () => {
    const storage = memoryStorage();
    writePendingSellMedia(
      {
        images: Array.from({ length: 12 }, (_, i) => ({
          filename: `${i}.jpg`,
          contentType: "image/jpeg",
          base64: "x",
          dataUrl: "data:image/jpeg;base64,x",
        })),
        video: null,
      },
      storage
    );
    expect(takePendingSellMedia(storage).images).toHaveLength(10);
  });

  it("splits mixed file lists", () => {
    const image = new File(["a"], "a.jpg", { type: "image/jpeg" });
    const video = new File(["b"], "b.mp4", { type: "video/mp4" });
    expect(splitMediaFiles([image, video])).toEqual({
      images: [image],
      videos: [video],
    });
  });

  it("clears the new media key after read", () => {
    const storage = memoryStorage();
    storage.setItem(SELL_PENDING_MEDIA_KEY, JSON.stringify({ images: [], video: null }));
    takePendingSellMedia(storage);
    expect(storage.getItem(SELL_PENDING_MEDIA_KEY)).toBeNull();
  });
});
