/**
 * PostgreSQL-first chat writes: membership → idempotency → atomic sequence → socket fanout.
 */

import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { AppError } from '../../../lib/errors';
import { getSocketGateway } from '../../../realtime/socket.gateway';
import { assertChatSendAllowed } from '../policies/SocialControlPolicy';
import { rememberPersistedMessage } from '../cache/messageCache';
import { computeDeliveryStatus } from './deliveryStatus';
import type { ChatMessageAttachmentDto, ChatMessageDto } from '../types';

export type ChatSendPayload = {
  clientMessageId: string;
  content?: string;
  type?: string;
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
  attachments?: ChatMessageAttachmentDto[];
};

const messageInclude = {
  attachments: true,
  replyTo: true,
  reactions: true,
} as const;

function seqToString(value: bigint | number | string | null | undefined) {
  if (value == null) return undefined;
  return value.toString();
}

function mapAttachments(
  rows?: Array<{
    id: string;
    url: string;
    mimeType: string;
    size: number;
    originalFilename: string;
    width: number | null;
    height: number | null;
    duration: number | null;
  }>,
): ChatMessageAttachmentDto[] | undefined {
  if (!rows?.length) return undefined;
  return rows.map((a) => ({
    id: a.id,
    url: a.url,
    mimeType: a.mimeType,
    size: a.size,
    originalFilename: a.originalFilename,
    width: a.width ?? undefined,
    height: a.height ?? undefined,
    duration: a.duration ?? undefined,
  }));
}

function toDto(row: {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  clientMsgId: string | null;
  createdAt: Date;
  status: string;
  kind?: string;
  serverSequence?: bigint | number | string;
  replyToMessageId?: string | null;
  metadataJson?: unknown;
  attachments?: Array<{
    id: string;
    url: string;
    mimeType: string;
    size: number;
    originalFilename: string;
    width: number | null;
    height: number | null;
    duration: number | null;
  }>;
}): ChatMessageDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    body: row.body,
    clientMsgId: row.clientMsgId,
    createdAt: row.createdAt.toISOString(),
    status: row.status === 'DELETED' ? 'deleted' : 'sent',
    kind: row.kind,
    serverSequence: seqToString(row.serverSequence),
    replyToMessageId: row.replyToMessageId ?? null,
    metadata: (row.metadataJson as Record<string, unknown>) ?? {},
    attachments: mapAttachments(row.attachments),
  };
}

export class ChatService {
  constructor(private db: PrismaClient = prisma) {}

  async sendMessage(userId: string, conversationId: string, payload: ChatSendPayload) {
    const clientMessageId = payload.clientMessageId?.trim();
    if (!clientMessageId) throw new AppError('VALIDATION', 'clientMessageId required', 400);
    const content = (payload.content ?? '').trim();
    const attachments = payload.attachments?.filter((a) => a.url && a.mimeType) ?? [];
    if (!content && !attachments.length && !payload.metadata) {
      throw new AppError('VALIDATION', 'content or attachments required', 400);
    }

    await assertChatSendAllowed(userId);

    const participant = await this.db.chatParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant) throw new AppError('CHAT_NOT_MEMBER', 'not a participant', 403);

    const saved = await this.db.$transaction(async (tx) => {
      const existing = await tx.chatMessage.findUnique({
        where: { senderId_clientMsgId: { senderId: userId, clientMsgId: clientMessageId } },
        include: messageInclude,
      });
      if (existing) return { row: existing, isDuplicate: true as const };

      const conv = await tx.chatConversation.update({
        where: { id: conversationId },
        data: {
          lastSequence: { increment: 1 },
          lastMessageAt: new Date(),
        },
        select: { lastSequence: true },
      });

      try {
        return {
          row: await tx.chatMessage.create({
            data: {
              clientMsgId: clientMessageId,
              conversationId,
              senderId: userId,
              serverSequence: conv.lastSequence,
              kind: (payload.type || 'TEXT').toUpperCase(),
              body: content,
              status: 'PERSISTED',
              persistedAt: new Date(),
              replyToMessageId: payload.replyToMessageId || null,
              metadataJson: (payload.metadata ?? {}) as object,
              attachments: attachments.length
                ? {
                    create: attachments.map((a) => ({
                      url: a.url,
                      mimeType: a.mimeType,
                      size: Math.max(0, Math.trunc(a.size || 0)),
                      originalFilename: a.originalFilename || 'file',
                      width: a.width,
                      height: a.height,
                      duration: a.duration,
                    })),
                  }
                : undefined,
            },
            include: messageInclude,
          }),
          isDuplicate: false as const,
        };
      } catch (e) {
        const raced = await tx.chatMessage.findUnique({
          where: { senderId_clientMsgId: { senderId: userId, clientMsgId: clientMessageId } },
          include: messageInclude,
        });
        if (raced) return { row: raced, isDuplicate: true as const };
        throw e;
      }
    });

    const message = await this.withReceipts(
      toDto(saved.row),
      conversationId,
      saved.row.status === 'DELETED',
    );
    message.isDuplicate = saved.isDuplicate;
    void rememberPersistedMessage(message).catch(() => undefined);

    if (!saved.isDuplicate) {
      try {
        const gateway = getSocketGateway();
        const notify = {
          conversationId,
          sequence: message.serverSequence,
          senderId: userId,
        };
        await gateway?.fanoutToConversation(conversationId, 'chat:notify', notify);
        await gateway?.fanoutToConversation(conversationId, 'chat:message', message);
        gateway?.emitToConversation(conversationId, 'chat:message_new', message);
      } catch (err) {
        console.error('[ChatService] Socket broadcast failed, data is safe in DB:', err);
      }
    }

    return { message, isDuplicate: saved.isDuplicate };
  }

  async syncMessages(userId: string, conversationId: string, afterSequence?: bigint, limit = 50) {
    const participant = await this.db.chatParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant) throw new AppError('CHAT_NOT_MEMBER', 'not a participant', 403);

    const take = Math.min(Math.max(limit, 1), 100);
    const rows = await this.db.chatMessage.findMany({
      where: {
        conversationId,
        status: { not: 'DELETED' },
        ...(afterSequence != null ? { serverSequence: { gt: afterSequence } } : {}),
      },
      orderBy: { serverSequence: 'asc' },
      take,
      include: messageInclude,
    });
    const participants = await this.db.chatParticipant.findMany({ where: { conversationId } });
    return rows.map((row) =>
      computeWrapped(toDto(row), participants, row.status === 'DELETED'),
    );
  }

  async getHistory(userId: string, conversationId: string, beforeSequence?: bigint, limit = 30) {
    const participant = await this.db.chatParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant) throw new AppError('CHAT_NOT_MEMBER', 'not a participant', 403);

    const take = Math.min(Math.max(limit, 1), 50);
    const rows = await this.db.chatMessage.findMany({
      where: {
        conversationId,
        status: { not: 'DELETED' },
        ...(beforeSequence != null ? { serverSequence: { lt: beforeSequence } } : {}),
      },
      orderBy: { serverSequence: 'desc' },
      take,
      include: messageInclude,
    });
    const hasMore = rows.length === take;
    const participants = await this.db.chatParticipant.findMany({ where: { conversationId } });
    const chronological = [...rows].reverse();
    return {
      messages: chronological.map((row) =>
        computeWrapped(toDto(row), participants, row.status === 'DELETED'),
      ),
      hasMore,
    };
  }

  async markAsRead(userId: string, conversationId: string, sequence: bigint) {
    const participant = await this.db.chatParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant) throw new AppError('CHAT_NOT_MEMBER', 'not a participant', 403);

    const updated = await this.db.chatParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: {
        lastReadSequence: sequence,
        lastReadAt: new Date(),
        lastDeliveredAt: new Date(),
      },
    });

    const payload = {
      conversationId,
      userId,
      sequence: sequence.toString(),
      lastReadAt: updated.lastReadAt?.toISOString() ?? null,
      lastDeliveredAt: updated.lastDeliveredAt?.toISOString() ?? null,
      readAt: updated.lastReadAt,
    };
    try {
      const gateway = getSocketGateway();
      await gateway?.fanoutToConversation(conversationId, 'chat:read', payload);
      gateway?.emitToConversation(conversationId, 'chat:read_receipt', payload);
    } catch (err) {
      console.error('[ChatService] read receipt emit failed', err);
    }
    return updated;
  }

  private async withReceipts(message: ChatMessageDto, conversationId: string, deleted = false) {
    const participants = await this.db.chatParticipant.findMany({ where: { conversationId } });
    return computeWrapped(message, participants, deleted);
  }
}

function computeWrapped(
  message: ChatMessageDto,
  participants: Array<{ userId: string; lastReadAt?: Date | null; lastDeliveredAt?: Date | null }>,
  deleted: boolean,
): ChatMessageDto {
  return {
    ...message,
    status: computeDeliveryStatus({
      senderId: message.senderId,
      createdAt: message.createdAt,
      deleted,
      participants,
    }),
  };
}

export const chatService = new ChatService();
