import type { Area } from "react-easy-crop";

import { ImageUploadError } from "@/lib/imageUpload";

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new ImageUploadError("ไม่สามารถอ่านไฟล์รูปภาพได้"));
    image.src = url;
  });
}

function getRadianAngle(degreeValue: number) {
  return (degreeValue * Math.PI) / 180;
}

function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation);

  return {
    width:
      Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height:
      Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality = 0.92
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new ImageUploadError("ประมวลผลรูปภาพไม่สำเร็จ"));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}

function getOutputMimeType(file: File) {
  if (file.type === "image/png" || file.type === "image/webp") {
    return file.type;
  }

  return "image/jpeg";
}

function updateFilenameExtension(filename: string, contentType: string): string {
  const base = filename.replace(/\.[^.]+$/, "") || "image";
  if (contentType === "image/png") return `${base}.png`;
  if (contentType === "image/webp") return `${base}.webp`;
  return `${base}.jpg`;
}

export async function cropImageFile(
  file: File,
  croppedAreaPixels: Area,
  rotation = 0
): Promise<File> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await createImage(objectUrl);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new ImageUploadError("ไม่สามารถประมวลผลรูปภาพได้");
    }

    const rotRad = getRadianAngle(rotation);
    const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
      image.width,
      image.height,
      rotation
    );

    canvas.width = bBoxWidth;
    canvas.height = bBoxHeight;

    ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
    ctx.rotate(rotRad);
    ctx.translate(-image.width / 2, -image.height / 2);
    ctx.drawImage(image, 0, 0);

    const croppedCanvas = document.createElement("canvas");
    const croppedCtx = croppedCanvas.getContext("2d");

    if (!croppedCtx) {
      throw new ImageUploadError("ไม่สามารถประมวลผลรูปภาพได้");
    }

    croppedCanvas.width = croppedAreaPixels.width;
    croppedCanvas.height = croppedAreaPixels.height;

    croppedCtx.drawImage(
      canvas,
      croppedAreaPixels.x,
      croppedAreaPixels.y,
      croppedAreaPixels.width,
      croppedAreaPixels.height,
      0,
      0,
      croppedAreaPixels.width,
      croppedAreaPixels.height
    );

    const mimeType = getOutputMimeType(file);
    const blob = await canvasToBlob(croppedCanvas, mimeType);

    return new File([blob], updateFilenameExtension(file.name, mimeType), {
      type: mimeType,
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
