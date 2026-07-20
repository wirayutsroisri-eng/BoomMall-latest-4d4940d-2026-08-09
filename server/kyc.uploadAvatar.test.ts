import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { kycRouter } from "./routers/kyc";
import { protectedProcedure } from "./_core/trpc";

// Mock dependencies
vi.mock("./db", () => ({
  updateUser: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "/manus-storage/test-avatar.jpg" }),
}));

describe("kyc.uploadAvatar", () => {
  let mockCtx: any;

  beforeEach(() => {
    mockCtx = {
      user: {
        id: 1,
        kycStatus: "pending",
      },
      req: {},
      res: {},
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should upload avatar with valid base64 image", async () => {
    // Create a simple valid base64 image (1x1 pixel PNG)
    const validBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const procedure = kycRouter.createCaller(mockCtx).uploadAvatar;
    const result = await procedure({
      base64: validBase64,
      mimeType: "image/png",
    });

    expect(result).toEqual({
      success: true,
      avatarUrl: "/manus-storage/test-avatar.jpg",
    });
  });

  it("should accept base64 with data URI prefix", async () => {
    const validBase64WithPrefix = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const procedure = kycRouter.createCaller(mockCtx).uploadAvatar;
    const result = await procedure({
      base64: validBase64WithPrefix,
      mimeType: "image/png",
    });

    expect(result).toEqual({
      success: true,
      avatarUrl: "/manus-storage/test-avatar.jpg",
    });
  });

  it("should support image/jpeg mime type", async () => {
    const validBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const procedure = kycRouter.createCaller(mockCtx).uploadAvatar;
    const result = await procedure({
      base64: validBase64,
      mimeType: "image/jpeg",
    });

    expect(result.success).toBe(true);
  });

  it("should support image/webp mime type", async () => {
    const validBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const procedure = kycRouter.createCaller(mockCtx).uploadAvatar;
    const result = await procedure({
      base64: validBase64,
      mimeType: "image/webp",
    });

    expect(result.success).toBe(true);
  });

  it("should support image/gif mime type", async () => {
    const validBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const procedure = kycRouter.createCaller(mockCtx).uploadAvatar;
    const result = await procedure({
      base64: validBase64,
      mimeType: "image/gif",
    });

    expect(result.success).toBe(true);
  });

  it("should reject invalid mime types", async () => {
    const validBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const procedure = kycRouter.createCaller(mockCtx).uploadAvatar;

    // @ts-expect-error - Testing invalid mime type
    await expect(
      procedure({
        base64: validBase64,
        mimeType: "image/svg+xml", // Not in allowed list
      })
    ).rejects.toThrow();
  });

  it("should reject oversized images (>2MB)", async () => {
    // Create a large base64 string (simulate >2MB)
    const largeBase64 = "A".repeat(3 * 1024 * 1024); // 3MB of 'A' characters

    const procedure = kycRouter.createCaller(mockCtx).uploadAvatar;

    await expect(
      procedure({
        base64: largeBase64,
        mimeType: "image/png",
      })
    ).rejects.toThrow("รูปใหญ่เกินไป");
  });

  it("should require authenticated user", async () => {
    const unauthCtx = {
      user: null,
      req: {},
      res: {},
    };

    const procedure = kycRouter.createCaller(unauthCtx).uploadAvatar;

    await expect(
      procedure({
        base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        mimeType: "image/png",
      })
    ).rejects.toThrow();
  });

  it("should handle empty base64 gracefully", async () => {
    // Empty base64 will result in a 0-byte buffer, which is allowed
    // The upload will proceed but may result in an invalid image
    const procedure = kycRouter.createCaller(mockCtx).uploadAvatar;

    const result = await procedure({
      base64: "",
      mimeType: "image/png",
    });

    // Should still succeed (storage layer handles validation)
    expect(result.success).toBe(true);
  });
});
