/**
 * S3-compatible object storage (AWS / MinIO / Cloudflare R2).
 * Clients PUT bytes to a presigned URL so chat API never carries the file.
 */

import { randomBytes } from 'node:crypto';
import { HeadObjectCommand, S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '../../../lib/errors';
import { chatMediaExtension, normalizeChatMime } from '../mediaTypes';

export type ObjectStorageConfig = {
  provider: 'cloudflare-r2' | 'aws-s3' | 's3-compatible';
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  cdnBaseUrl?: string;
  forcePathStyle: boolean;
};

let cachedClient: S3Client | null = null;
let cachedConfig: ObjectStorageConfig | null | undefined;

export function objectStorageConfig(): ObjectStorageConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;
  const bucket = process.env.AWS_S3_BUCKET?.trim() || process.env.S3_BUCKET?.trim();
  if (!bucket) {
    cachedConfig = null;
    return null;
  }
  const endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim() || undefined;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim() || undefined;
  const isR2 = Boolean(endpoint && /\.r2\.cloudflarestorage\.com\/?$/i.test(endpoint));
  if (endpoint && (!accessKeyId || !secretAccessKey)) {
    cachedConfig = null;
    return null;
  }
  cachedConfig = {
    provider: isR2 ? 'cloudflare-r2' : endpoint ? 's3-compatible' : 'aws-s3',
    bucket,
    region: process.env.AWS_REGION?.trim() || (isR2 ? 'auto' : 'ap-southeast-1'),
    endpoint,
    accessKeyId,
    secretAccessKey,
    cdnBaseUrl: process.env.CDN_BASE_URL?.trim().replace(/\/$/, '') || undefined,
    forcePathStyle: Boolean(endpoint && !isR2),
  };
  return cachedConfig;
}

export function isObjectStorageConfigured() {
  return Boolean(objectStorageConfig());
}

export function objectStorageReadiness() {
  const config = objectStorageConfig();
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const isR2 = Boolean(endpoint && /\.r2\.cloudflarestorage\.com\/?$/i.test(endpoint));
  if (!config) {
    const missing = [
      ...(process.env.AWS_S3_BUCKET?.trim() || process.env.S3_BUCKET?.trim()
        ? []
        : ['AWS_S3_BUCKET (or S3_BUCKET)']),
      ...(endpoint && !process.env.AWS_ACCESS_KEY_ID?.trim() ? ['AWS_ACCESS_KEY_ID'] : []),
      ...(endpoint && !process.env.AWS_SECRET_ACCESS_KEY?.trim() ? ['AWS_SECRET_ACCESS_KEY'] : []),
      ...(isR2 && !process.env.CDN_BASE_URL?.trim() ? ['CDN_BASE_URL'] : []),
    ];
    return {
      configured: false,
      provider: isR2 ? 'cloudflare-r2' as const : endpoint ? 's3-compatible' as const : 'unconfigured' as const,
      endpointConfigured: Boolean(endpoint),
      publicBaseConfigured: Boolean(process.env.CDN_BASE_URL?.trim()),
      missing,
    };
  }
  const missing = config.provider === 'cloudflare-r2' && !config.cdnBaseUrl
    ? ['CDN_BASE_URL']
    : [];
  return {
    configured: missing.length === 0,
    provider: config.provider,
    bucket: config.bucket,
    endpointConfigured: Boolean(config.endpoint),
    publicBaseConfigured: Boolean(config.cdnBaseUrl),
    region: config.region,
    missing,
  };
}

export function assertMediaAssetStorageReady(): ObjectStorageConfig {
  const config = objectStorageConfig();
  if (!config) throw new AppError('OBJECT_STORAGE_NOT_CONFIGURED', 'Object storage is not configured', 501);
  if (config.provider === 'cloudflare-r2' && !config.cdnBaseUrl) {
    throw new AppError(
      'MEDIA_PUBLIC_BASE_URL_REQUIRED',
      'Cloudflare R2 media requires CDN_BASE_URL or a public custom-domain base URL',
      501,
    );
  }
  return config;
}

function s3(): { client: S3Client; config: ObjectStorageConfig } {
  const config = objectStorageConfig();
  if (!config) throw new AppError('OBJECT_STORAGE_NOT_CONFIGURED', 'Object storage is not configured', 501);
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: config.forcePathStyle } : {}),
      ...(config.accessKeyId && config.secretAccessKey
        ? { credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }
        : {}),
    });
  }
  return { client: cachedClient, config };
}

export function publicObjectUrl(config: ObjectStorageConfig, key: string) {
  if (config.cdnBaseUrl) return `${config.cdnBaseUrl}/${key}`;
  if (config.endpoint) {
    const base = config.endpoint.replace(/\/$/, '');
    return `${base}/${config.bucket}/${key}`;
  }
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}

function safeUserSegment(userId: string) {
  const cleaned = userId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return cleaned || 'user';
}

export class UploadService {
  static async generatePresignedUploadUrl(userId: string, filename: string, mimeType: string) {
    const mime = normalizeChatMime(mimeType);
    const ext = chatMediaExtension(mime);
    if (!ext) throw new AppError('VALIDATION', 'unsupported media type', 415);

    const { client, config } = s3();
    const key = `chat-media/${safeUserSegment(userId)}/${Date.now()}-${randomBytes(16).toString('hex')}.${ext}`;
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: mime,
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 });

    return {
      uploadUrl,
      publicUrl: publicObjectUrl(config, key),
      fileKey: key,
      mimeType: mime,
      headers: { 'Content-Type': mime },
      expiresIn: 900,
      originalFilename: filename.replace(/[/\\]/g, '').slice(0, 180) || `file.${ext}`,
    };
  }

  static async generateMediaAssetUploadUrl(
    userId: string,
    assetId: string,
    filename: string,
    mimeType: string,
    contentLength?: number,
  ) {
    const normalizedMime = mimeType.trim().toLowerCase();
    const extension = mediaAssetExtension(normalizedMime);
    if (!extension) throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'unsupported image or video type', 415);
    const kind = normalizedMime.startsWith('video/') ? 'video' : 'image';
    assertMediaAssetStorageReady();
    const { client, config } = s3();
    const key = `media/${safeUserSegment(userId)}/${assetId}/original.${extension}`;
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: normalizedMime,
      ...(contentLength != null ? { ContentLength: contentLength } : {}),
    }), { expiresIn: 900 });
    return {
      uploadUrl,
      publicUrl: publicObjectUrl(config, key),
      fileKey: key,
      mediaType: kind as 'image' | 'video',
      mimeType: normalizedMime,
      headers: {
        'Content-Type': normalizedMime,
        ...(contentLength != null ? { 'Content-Length': String(contentLength) } : {}),
      },
      expiresIn: 900,
      originalFilename: filename.replace(/[/\\]/g, '').slice(0, 180) || `media.${extension}`,
    };
  }

  static async assertObjectUploaded(storageKey: string) {
    const { client, config } = s3();
    const object = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: storageKey }));
    return {
      contentLength: typeof object.ContentLength === 'number' ? object.ContentLength : undefined,
      contentType: object.ContentType,
    };
  }
}

function mediaAssetExtension(mimeType: string) {
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/x-m4v': 'm4v',
  };
  return extensions[mimeType];
}
