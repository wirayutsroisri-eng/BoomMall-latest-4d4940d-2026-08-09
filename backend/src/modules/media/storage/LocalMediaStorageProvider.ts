import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request } from 'express';
import { AppError } from '../../../lib/errors';
import type { CreateMediaUploadInput, MediaStorageProvider } from './MediaStorageProvider';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
};

const runtimeSecret = randomBytes(32).toString('hex');

function uploadRoot() {
  const configuredRoot = process.env.LOCAL_MEDIA_DIR?.trim();
  if (configuredRoot) return path.resolve(configuredRoot);

  // Keep development uploads stable whether the API is started from the repo
  // root (`npm --prefix backend ...`) or from inside `backend/`.
  return path.resolve(__dirname, '../../../../uploads');
}

export function localMediaUploadDir() {
  return uploadRoot();
}

export function ensureLocalMediaUploadDirectories() {
  for (const directory of ['images', 'videos', 'thumbnails']) {
    fs.mkdirSync(path.join(uploadRoot(), directory), { recursive: true, mode: 0o700 });
  }
}

function publicBaseUrl() {
  const raw = (process.env.MEDIA_PUBLIC_BASE_URL || process.env.PUBLIC_API_URL || '').trim().replace(/\/$/, '');
  if (!raw) {
    throw new AppError(
      'MEDIA_PUBLIC_BASE_URL_REQUIRED',
      'Local media storage requires MEDIA_PUBLIC_BASE_URL or PUBLIC_API_URL using the backend LAN address',
      501,
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AppError('MEDIA_PUBLIC_BASE_URL_INVALID', 'Local media public base must be an HTTP(S) URL', 501);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AppError('MEDIA_PUBLIC_BASE_URL_INVALID', 'Local media public base must be an HTTP(S) URL', 501);
  }
  return raw;
}

function signingSecret() {
  return process.env.LOCAL_MEDIA_UPLOAD_SECRET?.trim() || runtimeSecret;
}

function signature(assetId: string, storageKey: string, mimeType: string, fileSize: number, expiresAt: number) {
  return createHmac('sha256', signingSecret())
    .update(`${assetId}\n${storageKey}\n${mimeType}\n${fileSize}\n${expiresAt}`)
    .digest('hex');
}

function createUploadToken(assetId: string, storageKey: string, mimeType: string, fileSize: number) {
  const expiresAt = Math.floor(Date.now() / 1000) + 900;
  return `${expiresAt}.${signature(assetId, storageKey, mimeType, fileSize, expiresAt)}`;
}

function safePath(storageKey: string) {
  if (!/^(images|videos|thumbnails)\/[a-f0-9-]+\.[a-z0-9]+$/i.test(storageKey)) {
    throw new AppError('INVALID_STORAGE_KEY', 'Invalid local media storage key', 400);
  }
  const root = uploadRoot();
  const resolved = path.resolve(root, storageKey);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new AppError('INVALID_STORAGE_KEY', 'Invalid local media storage path', 400);
  }
  return resolved;
}

async function hasExpectedFileSignature(filename: string, mimeType: string) {
  const handle = await fs.promises.open(filename, 'r');
  try {
    const header = Buffer.alloc(32);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);
    if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (mimeType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (mimeType === 'image/webp') return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
    if (mimeType === 'image/heic' || mimeType === 'image/heif') {
      return bytes.subarray(4, 8).toString('ascii') === 'ftyp'
        && /^(heic|heix|hevc|hevx|mif1|msf1)$/i.test(bytes.subarray(8, 12).toString('ascii'));
    }
    if (mimeType === 'video/mp4' || mimeType === 'video/quicktime' || mimeType === 'video/x-m4v') {
      return bytes.subarray(4, 8).toString('ascii') === 'ftyp';
    }
    return false;
  } finally {
    await handle.close();
  }
}

export class LocalMediaStorageProvider implements MediaStorageProvider {
  readonly kind = 'local' as const;

  async createUploadTarget(input: CreateMediaUploadInput) {
    const mimeType = input.mimeType.trim().toLowerCase();
    const extension = MIME_EXTENSIONS[mimeType];
    if (!extension) throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Unsupported image or video type', 415);
    const mediaType = mimeType.startsWith('video/') ? 'video' as const : 'image' as const;
    const directory = mediaType === 'video' ? 'videos' : 'images';
    // The backend-generated UUID is the filename. User-controlled filenames never reach the filesystem.
    const fileKey = `${directory}/${input.assetId}.${extension}`;
    const token = createUploadToken(input.assetId, fileKey, mimeType, input.fileSize);
    const base = publicBaseUrl();
    return {
      uploadUrl: `${base}/api/v1/media-assets/local-upload/${encodeURIComponent(input.assetId)}?token=${token}`,
      publicUrl: `${base}/uploads/${fileKey}`,
      fileKey,
      mediaType,
      mimeType,
      headers: { 'Content-Type': mimeType, 'Content-Length': String(input.fileSize) },
      expiresIn: 900,
      originalFilename: path.basename(input.filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || `media.${extension}`,
    };
  }

  async inspect(storageKey: string) {
    const filename = safePath(storageKey);
    const stat = await fs.promises.stat(filename);
    const extension = path.extname(filename).slice(1).toLowerCase();
    const contentType = Object.entries(MIME_EXTENSIONS).find(([, ext]) => ext === extension)?.[0];
    return { contentLength: stat.size, contentType };
  }

  async remove(storageKey: string) {
    await fs.promises.rm(safePath(storageKey), { force: true });
  }

  readiness() {
    let publicBaseConfigured = true;
    let publicBase: string | undefined;
    try {
      publicBase = publicBaseUrl();
    } catch {
      publicBaseConfigured = false;
    }
    return {
      storage: this.kind,
      configured: publicBaseConfigured,
      publicBaseConfigured,
      publicBase,
      uploadDirectory: uploadRoot(),
      persistentAcrossRestart: true,
      missing: publicBaseConfigured ? [] : ['MEDIA_PUBLIC_BASE_URL (or PUBLIC_API_URL)'],
    };
  }

  async receiveUpload(input: {
    request: Request;
    assetId: string;
    storageKey: string;
    mimeType: string;
    fileSize: number;
    token: string;
    maxBytes: number;
  }) {
    const [expiresRaw, suppliedSignature = ''] = input.token.split('.', 2);
    const expiresAt = Number(expiresRaw);
    if (!Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
      throw new AppError('UPLOAD_TOKEN_EXPIRED', 'Local media upload token has expired', 403);
    }
    const expectedToken = signature(input.assetId, input.storageKey, input.mimeType, input.fileSize, expiresAt);
    const actual = Buffer.from(suppliedSignature, 'utf8');
    const expected = Buffer.from(expectedToken, 'utf8');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new AppError('INVALID_UPLOAD_TOKEN', 'Invalid local media upload token', 403);
    }
    const requestMime = String(input.request.headers['content-type'] || '').split(';')[0]!.trim().toLowerCase();
    if (requestMime !== input.mimeType.trim().toLowerCase()) {
      throw new AppError('MEDIA_TYPE_MISMATCH', 'Uploaded content type does not match upload session', 415);
    }
    const declaredLength = Number(input.request.headers['content-length']);
    if (!Number.isFinite(declaredLength) || declaredLength !== input.fileSize || declaredLength > input.maxBytes) {
      throw new AppError('MEDIA_FILE_SIZE_MISMATCH', 'Uploaded content length does not match upload session', 413);
    }

    const destination = safePath(input.storageKey);
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${createHash('sha256').update(input.token).digest('hex').slice(0, 12)}.uploading`;
    let received = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        if (received > input.fileSize || received > input.maxBytes) {
          callback(new AppError('MEDIA_TOO_LARGE', 'Uploaded media exceeds the allowed size', 413));
          return;
        }
        callback(null, chunk);
      },
    });
    try {
      await pipeline(input.request, limiter, fs.createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
      if (received !== input.fileSize) throw new AppError('MEDIA_FILE_SIZE_MISMATCH', 'Uploaded byte count does not match upload session', 422);
      if (!(await hasExpectedFileSignature(temporary, input.mimeType))) {
        throw new AppError('MEDIA_CONTENT_INVALID', 'Uploaded bytes do not match the declared media type', 415);
      }
      await fs.promises.rename(temporary, destination);
    } catch (error) {
      await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}
