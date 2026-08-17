/**
 * Socket.io gateway — notify channel only. Messages persist via Chat API → Postgres.
 * Rooms: user:{id} (multi-device) and conv:{id} (open thread).
 */

import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { prisma } from '../lib/prisma';
import { duplicateRedisClient, getRedisClient, getRedisUrl } from '../modules/chat/infra/redis';
import {
  persistChatMessage,
  markConversationRead,
  markConversationDelivered,
  startChatFlushWorker,
} from '../modules/chat/services/ChatService';
import { notifyChatPush } from '../modules/chat/notify/pushFanout';
import type { ChatSocketAuth } from '../modules/chat/types';

type Ack = (payload: {
  ok: boolean;
  success?: boolean;
  error?: string;
  data?: unknown;
  conversationId?: string;
}) => void;

function handshakeBearer(socket: Socket, auth: ChatSocketAuth & { token?: string }) {
  const headerAuth =
    typeof socket.handshake.headers.authorization === 'string'
      ? socket.handshake.headers.authorization
      : '';
  if (headerAuth.startsWith('Bearer ')) return headerAuth.slice(7).trim();
  const raw = auth.token?.trim() || '';
  if (raw.toLowerCase().startsWith('bearer ')) return raw.slice(7).trim();
  return raw;
}

function conversationIdFrom(payload: unknown): string {
  if (typeof payload === 'string') return payload.trim();
  if (payload && typeof payload === 'object' && 'conversationId' in payload) {
    return String((payload as { conversationId?: string }).conversationId ?? '').trim();
  }
  return '';
}

async function isConversationMember(conversationId: string, userId: string): Promise<boolean> {
  try {
    const row = await prisma.chatParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    return Boolean(row);
  } catch {
    return process.env.NODE_ENV !== 'production';
  }
}

export class SocketGateway {
  private io: SocketIOServer | null = null;

  get server(): SocketIOServer | null {
    return this.io;
  }

  async attach(httpServer: HttpServer): Promise<{ io: SocketIOServer; path: string }> {
    const path = process.env.CHAT_SOCKET_PATH?.trim() || '/socket.io/chat';
    const corsOrigin = (process.env.CORS_ORIGIN ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const io = new SocketIOServer(httpServer, {
      path,
      cors: {
        origin: corsOrigin.length ? corsOrigin : true,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 20_000,
      pingInterval: 10_000,
      transports: ['websocket', 'polling'],
    });

    if (getRedisUrl()) {
      const pub = await getRedisClient();
      const sub = await duplicateRedisClient();
      if (pub && sub) {
        io.adapter(createAdapter(pub, sub));
        console.log('[chat] Socket.io Redis adapter enabled (horizontal scaling)');
      } else {
        console.warn('[chat] REDIS_URL set but clients unavailable — single-node mode');
      }
    }

    this.io = io;
    this.setupMiddleware();
    this.setupEventHandlers();
    startChatFlushWorker(Number(process.env.CHAT_FLUSH_INTERVAL_MS ?? 5000));
    return { io, path };
  }

  emitToConversation(conversationId: string, event: string, data: unknown) {
    try {
      if (conversationId) this.io?.to(`conv:${conversationId}`).emit(event, data);
    } catch (e) {
      console.warn('[chat] emitToConversation failed', e);
    }
  }

  emitToUser(userId: string, event: string, data: unknown) {
    try {
      if (userId) this.io?.to(`user:${userId}`).emit(event, data);
    } catch (e) {
      console.warn('[chat] emitToUser failed', e);
    }
  }

  /** Open thread + every device of every member (inbox / multi-device). */
  async fanoutToConversation(conversationId: string, event: string, data: unknown) {
    this.emitToConversation(conversationId, event, data);
    try {
      const members = await prisma.chatParticipant.findMany({
        where: { conversationId },
        select: { userId: true },
      });
      for (const member of members) this.emitToUser(member.userId, event, data);
    } catch {
      /* json-fallback / missing table — conv room is enough */
    }
  }

  private setupMiddleware() {
    this.io?.use(async (socket, next) => {
      try {
        const auth = (socket.handshake.auth ?? {}) as ChatSocketAuth & { token?: string };
        const bearer = handshakeBearer(socket, auth);
        if (!bearer) {
          next(new Error('AUTH_REQUIRED'));
          return;
        }
        const { verifyAppJwt } = await import('../modules/auth/JwtService');
        const claims = await verifyAppJwt(bearer);
        socket.data.userId = claims.sub;
        socket.data.role = claims.role ?? auth.role ?? 'BUYER';
        socket.data.shopId = claims.shopId ?? auth.shopId;
        next();
      } catch {
        next(new Error('INVALID_TOKEN'));
      }
    });
  }

  private setupEventHandlers() {
    const io = this.io;
    if (!io) return;

    io.on('connection', (socket: Socket) => {
      const userId = String(socket.data.userId ?? '');
      if (!userId) {
        socket.disconnect(true);
        return;
      }

      void socket.join(`user:${userId}`);

      socket.on('chat:join', async (payload: unknown, ack?: Ack) => {
        const conversationId = conversationIdFrom(payload);
        if (!conversationId) {
          ack?.({ ok: false, success: false, error: 'conversationId required' });
          return;
        }
        try {
          const member = await isConversationMember(conversationId, userId);
          if (!member) {
            ack?.({ ok: false, success: false, error: 'CHAT_NOT_MEMBER' });
            return;
          }
          await socket.join(`conv:${conversationId}`);
          ack?.({ ok: true, success: true, conversationId });
        } catch {
          ack?.({ ok: false, success: false, error: 'INTERNAL_ERROR' });
        }
      });

      socket.on('chat:leave', async (payload: unknown, ack?: Ack) => {
        const conversationId = conversationIdFrom(payload);
        if (conversationId) await socket.leave(`conv:${conversationId}`);
        ack?.({ ok: true, success: true });
      });

      socket.on(
        'chat:send',
        async (
          payload: {
            conversationId?: string;
            body?: string;
            clientMsgId?: string;
            metadata?: Record<string, unknown>;
          },
          ack?: Ack,
        ) => {
          try {
            const conversationId = String(payload?.conversationId ?? '');
            const msg = await persistChatMessage({
              conversationId,
              senderId: userId,
              body: String(payload?.body ?? ''),
              clientMsgId: payload?.clientMsgId,
              metadata: payload?.metadata,
            });
            ack?.({ ok: true, success: true, data: msg });
            notifyChatPush(msg, userId);
          } catch (e) {
            ack?.({
              ok: false,
              success: false,
              error: e instanceof Error ? e.message : 'send failed',
            });
          }
        },
      );

      socket.on(
        'chat:typing',
        (payload: { conversationId?: string; typing?: boolean; isTyping?: boolean }) => {
          const conversationId = String(payload?.conversationId ?? '');
          if (!conversationId) return;
          const typing = Boolean(payload?.typing ?? payload?.isTyping);
          const data = { conversationId, userId, typing, isTyping: typing };
          socket.to(`conv:${conversationId}`).emit('chat:typing', data);
          socket.to(`conv:${conversationId}`).emit('chat:user_typing', data);
        },
      );

      socket.on('chat:delivered', async (payload: unknown, ack?: Ack) => {
        const conversationId = conversationIdFrom(payload);
        if (!conversationId) {
          ack?.({ ok: false, success: false, error: 'conversationId required' });
          return;
        }
        try {
          const data = await markConversationDelivered(conversationId, userId);
          const body = { conversationId, userId, lastDeliveredAt: data.lastDeliveredAt };
          await this.fanoutToConversation(conversationId, 'chat:delivered', body);
          ack?.({ ok: true, success: true, data });
        } catch (e) {
          ack?.({
            ok: false,
            success: false,
            error: e instanceof Error ? e.message : 'delivered failed',
          });
        }
      });

      socket.on('chat:read', async (payload: unknown, ack?: Ack) => {
        const conversationId = conversationIdFrom(payload);
        if (!conversationId) {
          ack?.({ ok: false, success: false, error: 'conversationId required' });
          return;
        }
        try {
          const data = await markConversationRead(conversationId, userId);
          const body = {
            conversationId,
            userId,
            lastReadAt: data.lastReadAt,
            lastDeliveredAt: data.lastDeliveredAt,
          };
          await this.fanoutToConversation(conversationId, 'chat:read', body);
          ack?.({ ok: true, success: true, data });
        } catch (e) {
          ack?.({
            ok: false,
            success: false,
            error: e instanceof Error ? e.message : 'read failed',
          });
        }
      });
    });
  }
}

let gateway: SocketGateway | null = null;

export function getSocketGateway(): SocketGateway | null {
  return gateway;
}

export async function attachSocketGateway(httpServer: HttpServer) {
  const next = new SocketGateway();
  const handles = await next.attach(httpServer);
  gateway = next;
  return handles;
}
