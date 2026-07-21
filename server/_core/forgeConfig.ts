function readForgeEnv() {
  return {
    forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL?.trim() ?? "",
    forgeKey: process.env.BUILT_IN_FORGE_API_KEY?.trim() ?? "",
  };
}

export class StorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageConfigError";
  }
}

function missingConfigMessage(): string {
  return (
    "ระบบอัปโหลดรูปยังไม่พร้อมใช้งานบนเซิร์ฟเวอร์ " +
    "กรุณาตั้งค่า BUILT_IN_FORGE_API_URL และ BUILT_IN_FORGE_API_KEY " +
    "ใน Environment Variables ของ Vercel แล้ว redeploy"
  );
}

function invalidUrlMessage(rawUrl: string): string {
  return (
    `ค่า BUILT_IN_FORGE_API_URL ไม่ถูกต้อง (${rawUrl}) ` +
    "ต้องเป็น URL แบบเต็ม เช่น https://example.com แล้ว redeploy"
  );
}

export function getForgeConfig() {
  const { forgeApiUrl: rawUrl, forgeKey } = readForgeEnv();

  if (!rawUrl || !forgeKey) {
    throw new StorageConfigError(missingConfigMessage());
  }

  const normalizedUrl = rawUrl.replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(normalizedUrl)) {
    throw new StorageConfigError(invalidUrlMessage(rawUrl));
  }

  try {
    // Validate once so callers never hit Safari/WebKit's opaque URL parse error.
    new URL("/", normalizedUrl + "/");
  } catch {
    throw new StorageConfigError(invalidUrlMessage(rawUrl));
  }

  return { forgeUrl: normalizedUrl, forgeKey };
}

export function buildForgeApiUrl(path: string): URL {
  const { forgeUrl } = getForgeConfig();

  try {
    return new URL(path, `${forgeUrl}/`);
  } catch {
    throw new StorageConfigError(invalidUrlMessage(forgeUrl));
  }
}
