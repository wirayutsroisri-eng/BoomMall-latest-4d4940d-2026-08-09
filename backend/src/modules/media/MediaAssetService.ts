import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import type { PublishedMediaAsset } from './mediaAssetContract';
import { mediaStorageProvider } from './storage';
import { LocalMediaStorageProvider } from './storage/LocalMediaStorageProvider';
import { currentMediaUrl } from './publicMediaUrl';

type AssetInput = {
  type: 'image' | 'video';
  filename: string;
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;
  fileSize?: number;
};

function positiveInteger(value: number | undefined) {
  return value != null && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

export function mediaAssetMaxBytes(type: 'image' | 'video') {
  const fallback = type === 'image' ? 25 * 1024 * 1024 : 1024 * 1024 * 1024;
  const configured = Number(process.env[type === 'image' ? 'MEDIA_IMAGE_MAX_BYTES' : 'MEDIA_VIDEO_MAX_BYTES']);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : fallback;
}

function validateInput(input: AssetInput) {
  if (input.type !== 'image' && input.type !== 'video') {
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'type must be image or video', 422);
  }
  const mime = input.mimeType.trim().toLowerCase();
  if (!mime.startsWith(`${input.type}/`)) {
    throw new AppError('MEDIA_TYPE_MISMATCH', 'media type does not match mimeType', 422);
  }
  const fileSize = positiveInteger(input.fileSize);
  if (fileSize == null) {
    throw new AppError('MEDIA_FILE_SIZE_REQUIRED', 'media file size is required', 422);
  }
  const max = mediaAssetMaxBytes(input.type);
  if (fileSize > max) throw new AppError('MEDIA_TOO_LARGE', 'media file is too large', 413);
  return { mime, fileSize };
}

function dto(row: {
  id: string; ownerId: string; type: 'IMAGE' | 'VIDEO'; status: 'UPLOADING' | 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';
  storageKey: string; canonicalUrl: string; thumbnailUrl: string | null; playbackUrl: string | null;
  width: number | null; height: number | null; durationMs: number | null; mimeType: string; fileSize: bigint | null;
  createdAt: Date; updatedAt: Date;
}): PublishedMediaAsset {
  return {
    id: row.id,
    ownerId: row.ownerId,
    type: row.type.toLowerCase() as 'image' | 'video',
    status: row.status.toLowerCase() as PublishedMediaAsset['status'],
    storageKey: row.storageKey,
    canonicalUrl: currentMediaUrl(row.canonicalUrl)!,
    thumbnailUrl: currentMediaUrl(row.thumbnailUrl) ?? undefined,
    playbackUrl: currentMediaUrl(row.playbackUrl) ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    duration: row.durationMs != null ? row.durationMs / 1000 : undefined,
    mimeType: row.mimeType,
    fileSize: row.fileSize != null ? Number(row.fileSize) : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createMediaAssetUploadSession(ownerId: string, input: AssetInput) {
  const { mime, fileSize } = validateInput(input);
  const id = randomUUID();
  const signed = await mediaStorageProvider().createUploadTarget({
    ownerId,
    assetId: id,
    filename: input.filename,
    mimeType: mime,
    fileSize,
  });
  const row = await prisma.mediaAsset.create({
    data: {
      id,
      ownerId,
      type: input.type.toUpperCase() as 'IMAGE' | 'VIDEO',
      status: 'UPLOADING',
      storageKey: signed.fileKey,
      canonicalUrl: signed.publicUrl,
      playbackUrl: input.type === 'video' ? signed.publicUrl : null,
      width: positiveInteger(input.width),
      height: positiveInteger(input.height),
      durationMs: input.duration != null ? positiveInteger(input.duration * 1000) : undefined,
      mimeType: mime,
      fileSize: fileSize != null ? BigInt(fileSize) : undefined,
    },
  });
  return { asset: dto(row), upload: signed };
}

export async function confirmMediaAsset(ownerId: string, assetId: string) {
  const existing = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!existing || existing.ownerId !== ownerId) throw new AppError('MEDIA_ASSET_NOT_FOUND', 'media asset not found', 404);
  if (existing.status === 'READY') return dto(existing);
  try {
    const uploaded = await mediaStorageProvider().inspect(existing.storageKey);
    const actualSize = uploaded.contentLength;
    const expectedType = existing.mimeType.trim().toLowerCase();
    const actualType = uploaded.contentType?.split(';')[0]?.trim().toLowerCase();
    const type = existing.type === 'VIDEO' ? 'video' : 'image';
    if (actualSize == null || actualSize <= 0 || actualSize > mediaAssetMaxBytes(type)) {
      throw new Error('uploaded object size violates media policy');
    }
    if (existing.fileSize != null && BigInt(actualSize) !== existing.fileSize) {
      throw new Error('uploaded object size does not match upload session');
    }
    if (!actualType || actualType !== expectedType) {
      throw new Error('uploaded object content type does not match upload session');
    }
    const row = await prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        status: 'READY',
        fileSize: BigInt(actualSize),
        mimeType: actualType,
      },
    });
    return dto(row);
  } catch (error) {
    await prisma.mediaAsset.update({ where: { id: assetId }, data: { status: 'FAILED' } }).catch(() => undefined);
    throw new AppError('MEDIA_UPLOAD_NOT_FOUND', 'uploaded object could not be confirmed', 422, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function receiveLocalMediaAssetUpload(assetId: string, token: string, request: Request) {
  const provider = mediaStorageProvider();
  if (!(provider instanceof LocalMediaStorageProvider)) {
    throw new AppError('LOCAL_MEDIA_STORAGE_DISABLED', 'Local media upload is disabled', 404);
  }
  const existing = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!existing || existing.status !== 'UPLOADING' || existing.fileSize == null) {
    throw new AppError('MEDIA_ASSET_NOT_FOUND', 'Upload session was not found', 404);
  }
  const type = existing.type === 'VIDEO' ? 'video' : 'image';
  await provider.receiveUpload({
    request,
    assetId,
    storageKey: existing.storageKey,
    mimeType: existing.mimeType,
    fileSize: Number(existing.fileSize),
    token,
    maxBytes: mediaAssetMaxBytes(type),
  });
}

export async function readyMediaAssetsForPublish(ownerId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await prisma.mediaAsset.findMany({ where: { id: { in: ids }, ownerId } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = ids.map((id) => byId.get(id));
  if (ordered.some((asset) => !asset || asset.status !== 'READY')) {
    throw new AppError('MEDIA_ASSET_NOT_READY', 'Every media asset must be owned by the author and ready before publish', 422);
  }
  return ordered.map((asset) => dto(asset!));
}

export async function attachMediaAssetsToPost(ownerId: string, ids: string[], postId: string) {
  if (!ids.length) return;
  await prisma.mediaAsset.updateMany({
    where: { id: { in: ids }, ownerId, status: 'READY' },
    data: { postId },
  });
}

export async function attachMediaAssetToStory(ownerId: string, assetId: string, storyId: string) {
  await prisma.mediaAsset.updateMany({
    where: { id: assetId, ownerId, status: 'READY', postId: null },
    data: { storyId },
  });
}
