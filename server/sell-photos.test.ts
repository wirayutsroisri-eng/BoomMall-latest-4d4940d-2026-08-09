import { describe, expect, it } from "vitest";
import {
  SELL_PENDING_IMAGES_KEY,
  hasPendingSellImages,
  takePendingSellImages,
  writePendingSellImages,
} from "@shared/sell-photos";

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

describe("pending sell photos", () => {
  it("stores then consumes listing photos once", () => {
    const storage = memoryStorage();
    writePendingSellImages(
      [
        {
          filename: "shoe.jpg",
          contentType: "image/jpeg",
          base64: "abc",
          dataUrl: "data:image/jpeg;base64,abc",
        },
      ],
      storage
    );

    expect(storage.getItem(SELL_PENDING_IMAGES_KEY)).toBeTruthy();
    const first = takePendingSellImages(storage);
    expect(first).toHaveLength(1);
    expect(first[0]?.filename).toBe("shoe.jpg");
    expect(takePendingSellImages(storage)).toEqual([]);
  });

  it("reports whether photos are waiting", () => {
    const storage = memoryStorage();
    expect(hasPendingSellImages(storage)).toBe(false);
    writePendingSellImages(
      [
        {
          filename: "bag.jpg",
          contentType: "image/jpeg",
          base64: "x",
          dataUrl: "data:image/jpeg;base64,x",
        },
      ],
      storage
    );
    expect(hasPendingSellImages(storage)).toBe(true);
  });

  it("caps at 10 photos", () => {
    const storage = memoryStorage();
    writePendingSellImages(
      Array.from({ length: 12 }, (_, i) => ({
        filename: `${i}.jpg`,
        contentType: "image/jpeg",
        base64: "x",
        dataUrl: "data:image/jpeg;base64,x",
      })),
      storage
    );
    expect(takePendingSellImages(storage)).toHaveLength(10);
  });
});
