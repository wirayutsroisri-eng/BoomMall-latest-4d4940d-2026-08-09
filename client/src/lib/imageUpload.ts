import {
  MAX_IMAGE_UPLOAD_BYTES,
  formatUploadLimit,
} from "@shared/upload-limits";

export class ImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageUploadError";
  }
}

const COMPRESS_THRESHOLD_BYTES = 512 * 1024;
const DEFAULT_MAX_DIMENSION = 2048;

export type PreparedImageUpload = {
  blob: Blob;
  contentType: string;
  filename: string;
  dataUrl: string;
  base64: string;
};

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageUploadError("ไม่สามารถอ่านไฟล์รูปภาพได้"));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new ImageUploadError("บีบอัดรูปภาพไม่สำเร็จ")),
      type,
      quality
    );
  });
}

async function compressImage(
  file: File,
  opts: { maxDimension: number; quality: number; mimeType?: string }
): Promise<Blob> {
  const img = await loadImageFromFile(file);
  const scale = Math.min(
    1,
    opts.maxDimension / Math.max(img.width, img.height)
  );
  const targetW = Math.max(1, Math.round(img.width * scale));
  const targetH = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageUploadError("ไม่สามารถประมวลผลรูปภาพได้");
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const preserveAlpha = file.type === "image/png" || file.type === "image/webp";
  const mimeType = opts.mimeType ?? (preserveAlpha ? "image/webp" : "image/jpeg");
  return canvasToBlob(canvas, mimeType, opts.quality);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new ImageUploadError("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(blob);
  });
}

function updateFilenameExtension(filename: string, contentType: string): string {
  const base = filename.replace(/\.[^.]+$/, "") || "image";
  if (contentType === "image/webp") return `${base}.webp`;
  if (contentType === "image/png") return `${base}.png`;
  return `${base}.jpg`;
}

/** Compress large photos client-side, then validate against maxBytes (default 25MB). */
export async function prepareImageForUpload(
  file: File,
  options?: { maxBytes?: number; skipCompression?: boolean }
): Promise<PreparedImageUpload> {
  const maxBytes = options?.maxBytes ?? MAX_IMAGE_UPLOAD_BYTES;

  if (!file.type.startsWith("image/")) {
    throw new ImageUploadError("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
  }

  const isGif = file.type === "image/gif";
  let blob: Blob = file;
  let contentType = file.type;
  let filename = file.name;

  const compressionPasses = [
    { maxDimension: DEFAULT_MAX_DIMENSION, quality: 0.85 },
    { maxDimension: 1600, quality: 0.72, mimeType: "image/jpeg" },
    { maxDimension: 1280, quality: 0.6, mimeType: "image/jpeg" },
  ] as const;

  const shouldCompress =
    !options?.skipCompression &&
    !isGif &&
    (file.size > COMPRESS_THRESHOLD_BYTES || file.size > maxBytes);

  if (shouldCompress) {
    for (const pass of compressionPasses) {
      blob = await compressImage(file, pass);
      contentType =
        blob.type || ("mimeType" in pass ? pass.mimeType : undefined) || "image/jpeg";
      filename = updateFilenameExtension(filename, contentType);
      if (blob.size <= maxBytes) break;
    }
  }

  if (blob.size > maxBytes) {
    throw new ImageUploadError(
      `ไฟล์ใหญ่เกินไป (สูงสุด ${formatUploadLimit(maxBytes)})`
    );
  }

  const dataUrl = await blobToDataUrl(blob);
  const base64 = dataUrl.split(",")[1] ?? "";

  return { blob, contentType, filename, dataUrl, base64 };
}

/** Base64 payload for binary uploads (images are compressed first). */
export async function fileToBase64(file: File): Promise<string> {
  if (file.type.startsWith("image/")) {
    const prepared = await prepareImageForUpload(file);
    return prepared.base64;
  }
  return fileToBase64Raw(file);
}

/** Base64 payload without compression (videos and non-image files). */
export function fileToBase64Raw(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
