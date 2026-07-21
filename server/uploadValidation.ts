import { TRPCError } from "@trpc/server";
import {
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  formatUploadLimit,
} from "@shared/upload-limits";

export function assertImageUploadSize(buffer: Buffer, label = "รูปภาพ"): void {
  if (buffer.length > MAX_IMAGE_UPLOAD_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${label}ใหญ่เกินไป (สูงสุด ${formatUploadLimit(MAX_IMAGE_UPLOAD_BYTES)})`,
    });
  }
}

export function assertVideoUploadSize(buffer: Buffer): void {
  if (buffer.length > MAX_VIDEO_UPLOAD_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `วิดีโอใหญ่เกินไป (สูงสุด ${formatUploadLimit(MAX_VIDEO_UPLOAD_BYTES)})`,
    });
  }
}
