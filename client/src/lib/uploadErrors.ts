import { TRPCClientError } from "@trpc/client";

import { ImageUploadError } from "@/lib/imageUpload";

const STORAGE_CONFIG_HINT =
  "ตรวจสอบ BUILT_IN_FORGE_API_URL และ BUILT_IN_FORGE_API_KEY บน Vercel";

export function getUploadErrorMessage(
  error: unknown,
  fallback = "อัปโหลดรูปไม่สำเร็จ"
): string {
  if (error instanceof ImageUploadError) {
    return error.message;
  }

  if (error instanceof TRPCClientError) {
    const message = error.message.trim();
    if (message) return message;
  }

  if (error instanceof Error) {
    const message = error.message.trim();

    if (
      message.includes("did not match the expected pattern") ||
      message.includes("Storage config missing") ||
      message.includes("BUILT_IN_FORGE_API_URL")
    ) {
      return `ระบบอัปโหลดรูปยังไม่พร้อมใช้งาน ${STORAGE_CONFIG_HINT}`;
    }

    if (message) return message;
  }

  return fallback;
}
