import { afterEach, describe, expect, it, vi } from "vitest";

import { buildForgeApiUrl, getForgeConfig, StorageConfigError } from "./_core/forgeConfig";

describe("forgeConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns normalized forge config when env vars are valid", () => {
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "https://forge.example.com/");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "test-key");

    expect(getForgeConfig()).toEqual({
      forgeUrl: "https://forge.example.com",
      forgeKey: "test-key",
    });
  });

  it("throws a clear error when env vars are missing", () => {
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");

    expect(() => getForgeConfig()).toThrow(StorageConfigError);
    expect(() => getForgeConfig()).toThrow(/BUILT_IN_FORGE_API_URL/);
  });

  it("throws a clear error when forge URL is not absolute", () => {
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "forge.example.com");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "test-key");

    expect(() => getForgeConfig()).toThrow(/ต้องเป็น URL แบบเต็ม/);
  });

  it("builds forge API URLs without throwing", () => {
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "https://forge.example.com");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "test-key");

    const url = buildForgeApiUrl("v1/storage/presign/put");
    expect(url.toString()).toBe(
      "https://forge.example.com/v1/storage/presign/put"
    );
  });
});
