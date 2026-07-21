import { TRPCError } from "@trpc/server";

import { StorageConfigError } from "./_core/forgeConfig";

const STORAGE_CONFIG_HINT =
  "ตรวจสอบ BUILT_IN_FORGE_API_URL และ BUILT_IN_FORGE_API_KEY บน Vercel";

export function toStorageTrpcError(error: unknown): TRPCError {
  if (error instanceof StorageConfigError) {
    return new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error.message,
    });
  }

  if (error instanceof Error) {
    if (
      error.message.includes("Storage config missing") ||
      error.message.includes("did not match the expected pattern")
    ) {
      return new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `ระบบอัปโหลดรูปยังไม่พร้อมใช้งาน ${STORAGE_CONFIG_HINT}`,
      });
    }

    if (error.message.startsWith("Storage presign failed")) {
      return new TRPCError({
        code: "BAD_GATEWAY",
        message: `อัปโหลดรูปไม่สำเร็จ (เซิร์ฟเวอร์ storage ตอบกลับผิดพลาด) ${STORAGE_CONFIG_HINT}`,
      });
    }

    if (error.message.startsWith("Storage upload to S3 failed")) {
      return new TRPCError({
        code: "BAD_GATEWAY",
        message: "อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      });
    }

    return new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error.message,
    });
  }

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  });
}
