import type { NextFunction, Response } from 'express';
import { AppError } from '../../../lib/errors';
import type { UserAuthedRequest } from '../../../middleware/userAuth';
import { notifyChatPush } from '../notify/pushFanout';
import { fanoutToConversation } from '../realtime/socketServer';
import { normalizeChatMetadata, sendWarehouseProductCard } from '../services/ChatCatalogService';
import {
  createOrGetConversation,
  listConversationsForUser,
  listMessagePage,
  markConversationRead,
} from '../services/ChatService';
import { ChatService, chatService, type ChatSendPayload } from '../services/chat.service';
import { UploadService } from '../services/upload.service';
import type { ChatMessageAttachmentDto } from '../types';

function actorId(req: UserAuthedRequest) {
  const id = req.user?.id?.trim() || req.user?.sub?.trim();
  if (!id) throw new AppError('UNAUTHORIZED', 'กรุณาเข้าสู่ระบบก่อนใช้งาน', 401);
  return id;
}

function conversationIdOf(req: UserAuthedRequest) {
  const raw = req.params.conversationId ?? req.params.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  const conversationId = String(id ?? '').trim();
  if (!conversationId) throw new AppError('VALIDATION', 'conversationId required', 400);
  return conversationId;
}

function parseSeq(raw: unknown): bigint | undefined {
  if (raw == null || raw === '') return undefined;
  const text = String(raw);
  if (!/^\d+$/.test(text)) throw new AppError('VALIDATION', 'invalid sequence', 400);
  return BigInt(text);
}

function parseLimit(raw: unknown, fallback: number, max: number) {
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), 1), max);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseAttachments(raw: unknown): ChatMessageAttachmentDto[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rows: ChatMessageAttachmentDto[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    const url = typeof row.url === 'string' ? row.url.trim() : '';
    const mimeType = typeof row.mimeType === 'string' ? row.mimeType.trim() : '';
    if (!url || !mimeType) continue;
    rows.push({
      url,
      mimeType,
      size: Number.isFinite(Number(row.size)) ? Math.max(0, Math.trunc(Number(row.size))) : 0,
      originalFilename:
        typeof row.originalFilename === 'string' && row.originalFilename.trim()
          ? row.originalFilename.trim()
          : 'file',
      width: row.width == null ? undefined : Number(row.width) || undefined,
      height: row.height == null ? undefined : Number(row.height) || undefined,
      duration: row.duration == null ? undefined : Number(row.duration) || undefined,
    });
  }
  return rows.length ? rows : undefined;
}

function parseSendPayload(body: unknown): ChatSendPayload {
  const row = asRecord(body);
  const clientMessageId = String(row.clientMessageId ?? row.clientMsgId ?? '').trim();
  const content =
    typeof row.content === 'string'
      ? row.content
      : typeof row.body === 'string'
        ? row.body
        : typeof row.text === 'string'
          ? row.text
          : '';
  const mediaUrl = typeof row.mediaUrl === 'string' ? row.mediaUrl.trim() : '';
  const attachments = parseAttachments(row.attachments) ?? (mediaUrl
    ? [
        {
          url: mediaUrl,
          mimeType: typeof row.mimeType === 'string' ? row.mimeType : 'application/octet-stream',
          size: 0,
          originalFilename: 'media',
        },
      ]
    : undefined);
  return {
    clientMessageId,
    content,
    type: typeof row.type === 'string' ? row.type : undefined,
    replyToMessageId: typeof row.replyToMessageId === 'string' ? row.replyToMessageId : undefined,
    metadata: normalizeChatMetadata(asRecord(row.metadata)),
    attachments,
  };
}

function isDatabaseUnavailable(err: unknown) {
  if (!err || typeof err !== 'object') return false;
  const code = 'code' in err ? String((err as { code: unknown }).code) : '';
  return (
    code === 'P1001' ||
    code === 'P1002' ||
    code === 'P1017' ||
    code === 'P2024' ||
    code === 'ECONNREFUSED'
  );
}

function fail(err: unknown, next: NextFunction, unavailableCode: string) {
  if (err instanceof AppError) {
    next(err);
    return;
  }
  if (isDatabaseUnavailable(err)) {
    next(new AppError(unavailableCode, 'Chat database unavailable', 503));
    return;
  }
  next(err);
}

export class ChatController {
  constructor(private service: ChatService = chatService) {}

  sendMessage = async (req: UserAuthedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = actorId(req);
      const conversationId = conversationIdOf(req);
      const result = await this.service.sendMessage(userId, conversationId, parseSendPayload(req.body));
      notifyChatPush(result.message, userId);
      res.status(result.isDuplicate ? 200 : 201).json({
        ok: true,
        success: true,
        ...result,
        data: result.message,
      });
    } catch (err) {
      fail(err, next, 'CHAT_DATABASE_UNAVAILABLE');
    }
  };

  syncMessages = async (req: UserAuthedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = actorId(req);
      const conversationId = conversationIdOf(req);
      const afterSequence = parseSeq(req.query.afterSequence);
      const limit = parseLimit(req.query.limit, 50, 100);
      const messages = await this.service.syncMessages(userId, conversationId, afterSequence, limit);
      res.json({
        ok: true,
        success: true,
        messages,
        data: [...messages].reverse(),
        hasMore: messages.length === limit,
      });
    } catch (err) {
      fail(err, next, 'SERVER_ERROR');
    }
  };

  getHistory = async (req: UserAuthedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = actorId(req);
      const conversationId = conversationIdOf(req);
      const beforeSequence = parseSeq(req.query.beforeSequence);
      const limit = parseLimit(req.query.limit, 30, 50);
      const result = await this.service.getHistory(userId, conversationId, beforeSequence, limit);
      res.json({
        ok: true,
        ...result,
        data: [...result.messages].reverse(),
      });
    } catch (err) {
      fail(err, next, 'SERVER_ERROR');
    }
  };

  listMessages = async (req: UserAuthedRequest, res: Response, next: NextFunction) => {
    const afterSequence = typeof req.query.afterSequence === 'string' ? req.query.afterSequence.trim() : '';
    const beforeSequence = typeof req.query.beforeSequence === 'string' ? req.query.beforeSequence.trim() : '';
    if (afterSequence) return this.syncMessages(req, res, next);
    if (beforeSequence) return this.getHistory(req, res, next);

    const before = typeof req.query.before === 'string' ? req.query.before.trim() : '';
    const after = typeof req.query.after === 'string' ? req.query.after.trim() : '';
    if (before || after) {
      try {
        const page = await listMessagePage(conversationIdOf(req), {
          limit: parseLimit(req.query.limit, 30, 50),
          before: before || undefined,
          after: after || undefined,
          userId: actorId(req),
        });
        res.json({ ok: true, data: page.messages, hasMore: page.hasMore });
      } catch (err) {
        fail(err, next, 'SERVER_ERROR');
      }
      return;
    }

    return this.getHistory(req, res, next);
  };

  markAsRead = async (req: UserAuthedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = actorId(req);
      const conversationId = conversationIdOf(req);
      const body = asRecord(req.body);
      const sequence = parseSeq(body.sequence ?? body.lastReadSequence);
      if (sequence != null) {
        await this.service.markAsRead(userId, conversationId, sequence);
        res.json({ ok: true, success: true });
        return;
      }
      const data = await markConversationRead(conversationId, userId);
      void fanoutToConversation(conversationId, 'chat:read', {
        conversationId,
        userId,
        lastReadAt: data.lastReadAt,
        lastDeliveredAt: data.lastDeliveredAt,
      });
      res.json({ ok: true, success: true, data });
    } catch (err) {
      fail(err, next, 'SERVER_ERROR');
    }
  };

  getInbox = async (req: UserAuthedRequest, res: Response, next: NextFunction) => {
    try {
      const conversations = await listConversationsForUser(actorId(req));
      res.json({ ok: true, data: conversations, conversations });
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      console.error('[Chat API] Inbox query error:', err);
      next(new AppError('DB_ERROR', 'ไม่สามารถดึงรายชื่อแชตได้', isDatabaseUnavailable(err) ? 503 : 500));
    }
  };

  createOrGetConversation = async (req: UserAuthedRequest, res: Response, next: NextFunction) => {
    try {
      const body = asRecord(req.body);
      const targetUserId = String(body.targetUserId ?? body.peerUserId ?? '').trim();
      const conversation = await createOrGetConversation(actorId(req), {
        targetUserId: targetUserId || undefined,
        type: typeof body.type === 'string' ? body.type : undefined,
        productId: typeof body.productId === 'string' ? body.productId : undefined,
        mallOrderId: typeof body.mallOrderId === 'string' ? body.mallOrderId : undefined,
        shopId: typeof body.shopId === 'string' ? body.shopId : undefined,
        shopName: typeof body.shopName === 'string' ? body.shopName : undefined,
        title: typeof body.title === 'string' ? body.title : undefined,
      });
      res.status(200).json({ ok: true, data: conversation, conversation });
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      console.error('[Chat API] Create conversation error:', err);
      next(new AppError('DB_ERROR', 'ไม่สามารถสร้างห้องแชตได้', isDatabaseUnavailable(err) ? 503 : 500));
    }
  };

  getMediaUploadUrl = async (req: UserAuthedRequest, res: Response, next: NextFunction) => {
    try {
      const body = asRecord(req.body);
      const filename = String(body.filename ?? body.originalFilename ?? '').trim();
      const mimeType = String(body.mimeType ?? '').trim();
      if (!filename || !mimeType) {
        throw new AppError('INVALID_INPUT', 'กรุณาระบุ filename และ mimeType', 400);
      }
      const data = await UploadService.generatePresignedUploadUrl(actorId(req), filename, mimeType);
      res.json({ ok: true, data, ...data });
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      console.error('[Chat API] Media presign error:', err);
      next(new AppError('STORAGE_UNAVAILABLE', 'ไม่สามารถสร้างลิงก์อัปโหลดได้', 500));
    }
  };

  sendProductCard = async (req: UserAuthedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = actorId(req);
      const conversationId = conversationIdOf(req);
      const body = asRecord(req.body);
      const clientMessageId = String(body.clientMessageId ?? body.clientMsgId ?? '').trim();
      const productId = String(body.productId ?? '').trim();
      if (!clientMessageId || !productId) {
        throw new AppError('INVALID_PAYLOAD', 'ต้องระบุ clientMessageId และ productId', 400);
      }
      const product = asRecord(body.product);
      const title = String(body.title ?? product.title ?? '').trim() || productId;
      const imageUrl = String(body.imageUrl ?? body.imageUri ?? product.imageUri ?? product.imageUrl ?? '');
      const msg = await sendWarehouseProductCard({
        conversationId,
        senderId: userId,
        productId,
        variantId: body.variantId ? String(body.variantId) : undefined,
        sku: body.sku ? String(body.sku) : undefined,
        clientMsgId: clientMessageId,
        fallback: {
          ...product,
          id: productId,
          title,
          price: body.price ?? product.price,
          imageUri: imageUrl || undefined,
        },
      });
      notifyChatPush(msg, userId);
      res.status(msg.isDuplicate ? 200 : 201).json({
        ok: true,
        data: msg,
        message: msg,
      });
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError('SEND_CARD_FAILED', 'ไม่สามารถส่งการ์ดสินค้าได้', 500));
    }
  };
}

export const chatController = new ChatController();
export { ChatController as ProductionChatController };
