import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../../lib/errors';
import { authedUserId, type UserAuthedRequest } from '../../../middleware/userAuth';
import { CHAT_MEDIA_MAX_BYTES, chatMediaExtension, normalizeChatMime } from '../mediaTypes';
import { isObjectStorageConfigured, UploadService } from '../services/upload.service';

export function chatMediaDir() {
  const root = process.env.CHAT_MEDIA_DIR?.trim() || path.join(process.cwd(), 'data/chat-media');
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function publicBase(req: Request) {
  const env = process.env.PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (env) return env;
  const host = req.get('host') || 'localhost';
  return `${req.protocol}://${host}`;
}

export function presignChatMedia(req: UserAuthedRequest, res: Response, next: NextFunction) {
  void (async () => {
    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const filename = String(body.filename ?? body.originalFilename ?? 'file');
      const mimeType = String(body.mimeType ?? '');
      const data = await UploadService.generatePresignedUploadUrl(authedUserId(req), filename, mimeType);
      res.status(201).json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  })();
}

export function uploadChatMedia(req: Request, res: Response, next: NextFunction) {
  try {
    const buf = Buffer.isBuffer(req.body) ? req.body : null;
    if (!buf?.length) throw new AppError('VALIDATION', 'empty file', 400);
    if (buf.length > CHAT_MEDIA_MAX_BYTES) throw new AppError('VALIDATION', 'file too large', 413);

    const mime = normalizeChatMime(String(req.header('x-mime-type') || req.header('content-type') || ''));
    const ext = chatMediaExtension(mime);
    if (!ext) throw new AppError('VALIDATION', 'unsupported media type', 415);

    const original = String(req.header('x-filename') || `file.${ext}`).replace(/[/\\]/g, '');
    const filename = `${randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(chatMediaDir(), filename), buf);

    res.status(201).json({
      ok: true,
      data: {
        url: `${publicBase(req)}/media/chat/${filename}`,
        mimeType: mime,
        size: buf.length,
        originalFilename: original.slice(0, 180) || filename,
        storage: isObjectStorageConfigured() ? 'local-fallback' : 'local',
      },
    });
  } catch (err) {
    next(err);
  }
}
