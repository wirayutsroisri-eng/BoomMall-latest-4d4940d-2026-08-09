/**
 * ChatService — Database is the source of truth.
 * Persist on send (idempotent via clientMsgId). Socket.io only fans out "new message".
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { AppError } from '../../../lib/errors';
import { pendingDepth, popPendingBatch } from '../cache/messageCache';
import { getRedisUrl } from '../infra/redis';
import { isObjectStorageConfigured } from './upload.service';
import { assertChatSendAllowed } from '../policies/SocialControlPolicy';
import { computeDeliveryStatus } from './deliveryStatus';
import { chatService } from './chat.service';
import type { ChatMessageDto, ChatMessagePage, ShopConversationDto } from '../types';

type JsonParticipant = {
  userId: string;
  role: string;
  lastReadAt?: string | null;
  lastDeliveredAt?: string | null;
};

type JsonConversation = {
  id: string;
  type: 'DIRECT' | 'SHOP' | 'GROUP';
  shopId: string | null;
  shopName: string | null;
  title: string | null;
  updatedAt: string;
  lastMessageAt?: string | null;
  contextProductId?: string | null;
  contextOrderId?: string | null;
  participants: JsonParticipant[];
};

type JsonStore = {
  conversations: JsonConversation[];
  messages: ChatMessageDto[];
};

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'chat-realtime.json');
const PAGE_MAX = 100;
const PAGE_DEFAULT = 30;

function readJson(): JsonStore {
  try {
    if (!fs.existsSync(DATA_FILE)) return { conversations: [], messages: [] };
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as JsonStore;
  } catch {
    return { conversations: [], messages: [] };
  }
}

function writeJson(store: JsonStore) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function shopParticipantRows(buyerId: string, sellerId: string) {
  if (buyerId === sellerId) {
    return [{ userId: buyerId, role: 'BUYER' }];
  }
  return [
    { userId: buyerId, role: 'BUYER' },
    { userId: sellerId, role: 'SELLER' },
  ];
}

async function prismaChatReady(): Promise<boolean> {
  try {
    await prisma.chatConversation.findFirst({ take: 1 });
    return true;
  } catch {
    return false;
  }
}

function clampLimit(limit?: number) {
  if (limit == null || !Number.isFinite(limit)) return PAGE_DEFAULT;
  return Math.min(Math.max(Math.trunc(limit), 1), PAGE_MAX);
}

function withReceipts(
  msg: Omit<ChatMessageDto, 'status'> & { status?: ChatMessageDto['status'] },
  participants: JsonParticipant[],
  deleted = false,
): ChatMessageDto {
  return {
    ...msg,
    status: computeDeliveryStatus({
      senderId: msg.senderId,
      createdAt: msg.createdAt,
      deleted,
      participants,
    }),
  };
}

export async function ensureShopConversation(input: {
  shopId: string;
  shopName?: string;
  buyerId: string;
  sellerId: string;
}): Promise<ShopConversationDto> {
  if (!input.shopId || !input.buyerId || !input.sellerId) {
    throw new AppError('VALIDATION', 'shopId, buyerId, sellerId required', 400);
  }

  if (await prismaChatReady()) {
    const existing = await prisma.chatConversation.findFirst({
      where: {
        type: 'SHOP',
        shopId: input.shopId,
        participants: { some: { userId: input.buyerId } },
      },
      include: { participants: true },
    });
    if (existing) return mapConversation(existing);

    const created = await prisma.chatConversation.create({
      data: {
        type: 'SHOP',
        shopId: input.shopId,
        shopName: input.shopName ?? input.shopId,
        title: `แชทร้าน ${input.shopName ?? input.shopId}`,
        participants: {
          create: shopParticipantRows(input.buyerId, input.sellerId),
        },
      },
      include: { participants: true },
    });
    return mapConversation(created);
  }

  const store = readJson();
  const found = store.conversations.find(
    (c) =>
      c.type === 'SHOP' &&
      c.shopId === input.shopId &&
      c.participants.some((p) => p.userId === input.buyerId),
  );
  if (found) return found;

  const row: ShopConversationDto = {
    id: randomUUID(),
    type: 'SHOP',
    shopId: input.shopId,
    shopName: input.shopName ?? input.shopId,
    title: `แชทร้าน ${input.shopName ?? input.shopId}`,
    updatedAt: new Date().toISOString(),
    participants: shopParticipantRows(input.buyerId, input.sellerId),
  };
  store.conversations = [row, ...store.conversations];
  writeJson(store);
  return row;
}

export async function listShopConversations(filters?: {
  shopId?: string;
  userId?: string;
}): Promise<ShopConversationDto[]> {
  if (await prismaChatReady()) {
    const rows = await prisma.chatConversation.findMany({
      where: {
        type: 'SHOP',
        ...(filters?.shopId ? { shopId: filters.shopId } : {}),
        ...(filters?.userId
          ? { participants: { some: { userId: filters.userId } } }
          : {}),
      },
      include: conversationListInclude,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return rows.map(mapConversation);
  }

  const store = readJson();
  let rows = store.conversations.filter((c) => c.type === 'SHOP');
  if (filters?.shopId) rows = rows.filter((c) => c.shopId === filters.shopId);
  if (filters?.userId) {
    rows = rows.filter((c) => c.participants.some((p) => p.userId === filters.userId));
  }
  return attachJsonPreviews(rows, store);
}

async function requireParticipant(conversationId: string, userId: string) {
  if (await prismaChatReady()) {
    const member = await prisma.chatParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new AppError('FORBIDDEN', 'not a participant', 403);
    return;
  }
  const conv = readJson().conversations.find((c) => c.id === conversationId);
  if (!conv?.participants.some((p) => p.userId === userId)) {
    throw new AppError('FORBIDDEN', 'not a participant', 403);
  }
}

async function loadParticipants(conversationId: string): Promise<JsonParticipant[]> {
  if (await prismaChatReady()) {
    const rows = await prisma.chatParticipant.findMany({ where: { conversationId } });
    return rows.map((p) => ({
      userId: p.userId,
      role: p.role,
      lastReadAt: p.lastReadAt?.toISOString() ?? null,
      lastDeliveredAt: p.lastDeliveredAt?.toISOString() ?? null,
    }));
  }
  return readJson().conversations.find((c) => c.id === conversationId)?.participants ?? [];
}

/**
 * Persist a message to the database (or JSON fallback) BEFORE acknowledging send.
 * Same clientMsgId in the same conversation returns the existing row (no duplicate).
 */
export async function persistChatMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
  clientMsgId?: string;
  metadata?: Record<string, unknown>;
  replyToMessageId?: string;
  type?: string;
  attachments?: ChatMessageDto['attachments'];
}): Promise<ChatMessageDto> {
  const clientMsgId = input.clientMsgId?.trim() || randomUUID();
  const metadata = input.metadata ?? {};
  const now = new Date();

  if (await prismaChatReady()) {
    const result = await chatService.sendMessage(input.senderId, input.conversationId, {
      clientMessageId: clientMsgId,
      content: input.body,
      type: input.type,
      replyToMessageId: input.replyToMessageId,
      metadata,
      attachments: input.attachments,
    });
    return { ...result.message, isDuplicate: result.isDuplicate };
  }

  if (!input.body.trim() && !input.attachments?.length) {
    throw new AppError('VALIDATION', 'body required', 400);
  }
  await assertChatSendAllowed(input.senderId);
  await requireParticipant(input.conversationId, input.senderId);

  const store = readJson();
  const conv = store.conversations.find((c) => c.id === input.conversationId);
  if (!conv) throw new AppError('NOT_FOUND', 'conversation not found', 404);
  const dup = store.messages.find(
    (m) => m.conversationId === input.conversationId && m.clientMsgId === clientMsgId,
  );
  if (dup) return withReceipts({ ...dup, isDuplicate: true }, conv.participants, dup.status === 'deleted');

  const dto: ChatMessageDto = {
    id: randomUUID(),
    conversationId: input.conversationId,
    senderId: input.senderId,
    body: input.body.trim(),
    clientMsgId,
    createdAt: now.toISOString(),
    status: 'sent',
    metadata,
    serverSequence: String(store.messages.filter((m) => m.conversationId === input.conversationId).length + 1),
    attachments: input.attachments,
    isDuplicate: false,
  };
  conv.updatedAt = now.toISOString();
  store.messages.unshift(dto);
  store.messages = store.messages.slice(0, 5000);
  writeJson(store);
  const saved = withReceipts(dto, conv.participants);
  void import('../../../realtime/socket.gateway')
    .then((m) => m.getSocketGateway()?.fanoutToConversation(input.conversationId, 'chat:message', saved))
    .catch(() => undefined);
  return saved;
}

/** @deprecated Use persistChatMessage — kept so older callers keep compiling. */
export const enqueueChatMessage = persistChatMessage;

export async function ensureDirectConversation(input: {
  userId: string;
  peerUserId: string;
  title?: string;
}): Promise<ShopConversationDto> {
  if (!input.userId || !input.peerUserId) {
    throw new AppError('VALIDATION', 'userId and peerUserId required', 400);
  }
  const ids = [input.userId, input.peerUserId].sort();
  if (await prismaChatReady()) {
    const existing = await prisma.chatConversation.findFirst({
      where: {
        type: 'DIRECT',
        contextOrderId: null,
        contextProductId: null,
        AND: [
          { participants: { some: { userId: ids[0] } } },
          { participants: { some: { userId: ids[1] } } },
        ],
      },
      include: { participants: true },
    });
    if (existing && existing.participants.length === 2) return mapConversation(existing);
    const created = await prisma.chatConversation.create({
      data: {
        type: 'DIRECT',
        title: input.title ?? 'แชทส่วนตัว',
        participants: {
          create: ids.map((userId) => ({ userId, role: 'MEMBER' })),
        },
      },
      include: { participants: true },
    });
    return mapConversation(created);
  }
  const store = readJson();
  const found = store.conversations.find(
    (c) =>
      c.type === 'DIRECT' &&
      !c.contextOrderId &&
      !c.contextProductId &&
      ids.every((id) => c.participants.some((p) => p.userId === id)) &&
      c.participants.length === 2,
  );
  if (found) return found;
  const row: ShopConversationDto = {
    id: randomUUID(),
    type: 'DIRECT',
    shopId: null,
    shopName: null,
    title: input.title ?? 'แชทส่วนตัว',
    updatedAt: new Date().toISOString(),
    participants: ids.map((userId) => ({ userId, role: 'MEMBER' })),
  };
  store.conversations = [row, ...store.conversations];
  writeJson(store);
  return row;
}

export async function ensureGroupConversation(input: {
  creatorId: string;
  memberIds: string[];
  title?: string;
}): Promise<ShopConversationDto> {
  const members = Array.from(new Set([input.creatorId, ...input.memberIds])).filter(Boolean);
  if (members.length < 2) throw new AppError('VALIDATION', 'group needs at least 2 members', 400);
  if (await prismaChatReady()) {
    const created = await prisma.chatConversation.create({
      data: {
        type: 'GROUP',
        title: input.title?.trim() || 'กลุ่ม',
        participants: {
          create: members.map((userId) => ({
            userId,
            role: userId === input.creatorId ? 'ADMIN' : 'MEMBER',
          })),
        },
      },
      include: { participants: true },
    });
    return mapConversation(created);
  }
  const store = readJson();
  const row: ShopConversationDto = {
    id: randomUUID(),
    type: 'GROUP',
    shopId: null,
    shopName: null,
    title: input.title?.trim() || 'กลุ่ม',
    updatedAt: new Date().toISOString(),
    participants: members.map((userId) => ({
      userId,
      role: userId === input.creatorId ? 'ADMIN' : 'MEMBER',
    })),
  };
  store.conversations = [row, ...store.conversations];
  writeJson(store);
  return row;
}

function parseChatType(raw?: string): 'DIRECT' | 'SHOP' | 'GROUP' {
  const type = (raw ?? 'DIRECT').trim().toUpperCase();
  if (type === 'SHOP' || type === 'GROUP') return type;
  return 'DIRECT';
}

export async function createOrGetConversation(
  userId: string,
  input: {
    targetUserId?: string;
    type?: string;
    productId?: string;
    mallOrderId?: string;
    shopId?: string;
    shopName?: string;
    title?: string;
  },
): Promise<ShopConversationDto> {
  const targetUserId = input.targetUserId?.trim() || '';
  const productId = input.productId?.trim() || '';
  const mallOrderId = input.mallOrderId?.trim() || '';
  const shopId = input.shopId?.trim() || '';
  const type = parseChatType(input.type);

  if (!targetUserId && !mallOrderId && !(type === 'SHOP' && shopId)) {
    throw new AppError('INVALID_TARGET', 'ต้องระบุ targetUserId หรือ mallOrderId', 400);
  }
  if (targetUserId && targetUserId === userId && !mallOrderId && type !== 'SHOP') {
    throw new AppError('INVALID_TARGET', 'ไม่สามารถสร้างแชทกับตัวเองได้', 400);
  }

  if (type === 'SHOP' && shopId && targetUserId) {
    const conv = await ensureShopConversation({
      shopId,
      shopName: input.shopName,
      buyerId: userId,
      sellerId: targetUserId,
    });
    return patchConversationContext(conv.id, { productId, mallOrderId, title: input.title });
  }

  if (type === 'DIRECT' && targetUserId && !mallOrderId && !productId) {
    return ensureDirectConversation({
      userId,
      peerUserId: targetUserId,
      title: input.title,
    });
  }

  const title =
    input.title?.trim() ||
    (mallOrderId ? `ออเดอร์ ${mallOrderId}` : productId ? `สินค้า ${productId}` : 'แชทส่วนตัว');

  if (await prismaChatReady()) {
    const existing = await prisma.chatConversation.findFirst({
      where: {
        type,
        ...(mallOrderId ? { contextOrderId: mallOrderId } : { contextOrderId: null }),
        ...(productId ? { contextProductId: productId } : mallOrderId ? {} : { contextProductId: null }),
        ...(shopId ? { shopId } : {}),
        AND: [
          { participants: { some: { userId } } },
          ...(targetUserId ? [{ participants: { some: { userId: targetUserId } } }] : []),
        ],
      },
      include: conversationListInclude,
    });
    if (existing) return mapConversation(existing);

    const created = await prisma.chatConversation.create({
      data: {
        type,
        shopId: type === 'SHOP' ? shopId || null : null,
        shopName: type === 'SHOP' ? input.shopName || shopId || null : null,
        title,
        contextProductId: productId || null,
        contextOrderId: mallOrderId || null,
        participants: {
          create: [
            { userId, role: type === 'SHOP' ? 'BUYER' : 'MEMBER' },
            ...(targetUserId
              ? [{ userId: targetUserId, role: type === 'SHOP' ? 'SELLER' : 'MEMBER' }]
              : []),
          ],
        },
      },
      include: conversationListInclude,
    });
    return mapConversation(created);
  }

  const store = readJson();
  const found = store.conversations.find(
    (c) =>
      c.type === type &&
      (mallOrderId ? c.contextOrderId === mallOrderId : !c.contextOrderId) &&
      (productId ? c.contextProductId === productId : mallOrderId ? true : !c.contextProductId) &&
      (!shopId || c.shopId === shopId) &&
      c.participants.some((p) => p.userId === userId) &&
      (!targetUserId || c.participants.some((p) => p.userId === targetUserId)),
  );
  if (found) return found;

  const now = new Date().toISOString();
  const row: ShopConversationDto = {
    id: randomUUID(),
    type,
    shopId: type === 'SHOP' ? shopId || null : null,
    shopName: type === 'SHOP' ? input.shopName || shopId || null : null,
    title,
    updatedAt: now,
    lastMessageAt: now,
    contextProductId: productId || null,
    contextOrderId: mallOrderId || null,
    participants: [
      { userId, role: type === 'SHOP' ? 'BUYER' : 'MEMBER' },
      ...(targetUserId
        ? [{ userId: targetUserId, role: type === 'SHOP' ? 'SELLER' : 'MEMBER' }]
        : []),
    ],
  };
  store.conversations = [row, ...store.conversations];
  writeJson(store);
  return row;
}

async function patchConversationContext(
  conversationId: string,
  input: { productId?: string; mallOrderId?: string; title?: string },
): Promise<ShopConversationDto> {
  const productId = input.productId?.trim() || '';
  const mallOrderId = input.mallOrderId?.trim() || '';
  const title = input.title?.trim() || '';
  const data = {
    ...(productId ? { contextProductId: productId } : {}),
    ...(mallOrderId ? { contextOrderId: mallOrderId } : {}),
    ...(title ? { title } : {}),
  };
  if (await prismaChatReady()) {
    const row =
      Object.keys(data).length === 0
        ? await prisma.chatConversation.findUnique({
            where: { id: conversationId },
            include: conversationListInclude,
          })
        : await prisma.chatConversation.update({
            where: { id: conversationId },
            data,
            include: conversationListInclude,
          });
    if (!row) throw new AppError('NOT_FOUND', 'conversation not found', 404);
    return mapConversation(row);
  }
  const store = readJson();
  const found = store.conversations.find((c) => c.id === conversationId);
  if (!found) throw new AppError('NOT_FOUND', 'conversation not found', 404);
  if (productId) found.contextProductId = productId;
  if (mallOrderId) found.contextOrderId = mallOrderId;
  if (title) found.title = title;
  writeJson(store);
  return found;
}

export async function listConversationsForUser(userId: string): Promise<ShopConversationDto[]> {
  if (await prismaChatReady()) {
    const rows = await prisma.chatConversation.findMany({
      where: { participants: { some: { userId } } },
      include: conversationListInclude,
      orderBy: [
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { updatedAt: 'desc' },
      ],
      take: 100,
    });
    return rows.map(mapConversation);
  }
  const store = readJson();
  return attachJsonPreviews(
    store.conversations.filter((c) => c.participants.some((p) => p.userId === userId)),
    store,
  );
}

export async function listAllConversations(filters?: {
  type?: 'DIRECT' | 'SHOP' | 'GROUP';
  userId?: string;
  limit?: number;
}): Promise<ShopConversationDto[]> {
  const take = Math.min(filters?.limit ?? 100, 200);
  if (await prismaChatReady()) {
    const rows = await prisma.chatConversation.findMany({
      where: {
        ...(filters?.type ? { type: filters.type } : {}),
        ...(filters?.userId ? { participants: { some: { userId: filters.userId } } } : {}),
      },
      include: conversationListInclude,
      orderBy: [
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { updatedAt: 'desc' },
      ],
      take,
    });
    return rows.map(mapConversation);
  }
  const store = readJson();
  let rows = store.conversations;
  if (filters?.type) rows = rows.filter((c) => c.type === filters.type);
  if (filters?.userId) {
    rows = rows.filter((c) => c.participants.some((p) => p.userId === filters.userId));
  }
  return attachJsonPreviews(rows.slice(0, take), store);
}

export async function markConversationDelivered(conversationId: string, userId: string) {
  const now = new Date();
  if (await prismaChatReady()) {
    try {
      await prisma.chatParticipant.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastDeliveredAt: now },
      });
    } catch (e) {
      console.warn('[chat] delivered receipt skipped', e);
    }
  } else {
    const store = readJson();
    const conv = store.conversations.find((c) => c.id === conversationId);
    const member = conv?.participants.find((p) => p.userId === userId);
    if (member) member.lastDeliveredAt = now.toISOString();
    if (conv) writeJson(store);
  }
  return { ok: true as const, lastDeliveredAt: now.toISOString() };
}

export async function markConversationRead(
  conversationId: string,
  userId: string,
  sequence?: bigint | string | number,
) {
  const now = new Date();
  const seq =
    sequence == null || sequence === ''
      ? undefined
      : typeof sequence === 'bigint'
        ? sequence
        : /^\d+$/.test(String(sequence))
          ? BigInt(String(sequence))
          : undefined;

  if ((await prismaChatReady()) && seq != null) {
    const updated = await chatService.markAsRead(userId, conversationId, seq);
    return {
      ok: true as const,
      lastReadAt: updated.lastReadAt?.toISOString() ?? now.toISOString(),
      lastDeliveredAt: updated.lastDeliveredAt?.toISOString() ?? now.toISOString(),
      sequence: seq.toString(),
    };
  }

  if (await prismaChatReady()) {
    try {
      await prisma.chatParticipant.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadAt: now, lastDeliveredAt: now },
      });
    } catch {
      await prisma.chatParticipant.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadAt: now },
      });
    }
  } else {
    const store = readJson();
    const conv = store.conversations.find((c) => c.id === conversationId);
    const member = conv?.participants.find((p) => p.userId === userId);
    if (member) {
      member.lastReadAt = now.toISOString();
      member.lastDeliveredAt = now.toISOString();
    }
    if (conv) writeJson(store);
  }
  return { ok: true as const, lastReadAt: now.toISOString(), lastDeliveredAt: now.toISOString() };
}

const conversationListInclude = {
  participants: true,
  messages: {
    where: { status: { not: 'DELETED' as const } },
    orderBy: { serverSequence: 'desc' as const },
    take: 1,
    select: { body: true },
  },
};

function attachJsonPreviews(
  rows: ShopConversationDto[],
  store: JsonStore,
): ShopConversationDto[] {
  const latest = new Map<string, { at: string; body: string }>();
  for (const m of store.messages) {
    const prev = latest.get(m.conversationId);
    if (!prev || m.createdAt > prev.at) {
      latest.set(m.conversationId, { at: m.createdAt, body: m.body });
    }
  }
  return rows.map((r) => ({
    ...r,
    lastMessage: r.lastMessage ?? latest.get(r.id)?.body ?? null,
  }));
}

function isoOf(value: Date | string | null | undefined) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.toISOString();
}

function mapConversation(row: {
  id: string;
  type: 'DIRECT' | 'SHOP' | 'GROUP';
  shopId: string | null;
  shopName: string | null;
  title: string | null;
  updatedAt: Date | string;
  lastMessageAt?: Date | string | null;
  contextProductId?: string | null;
  contextOrderId?: string | null;
  lastMessage?: string | null;
  messages?: Array<{ body: string }>;
  participants: Array<{
    userId: string;
    role: string;
    lastReadAt?: Date | string | null;
    lastDeliveredAt?: Date | string | null;
  }>;
}): ShopConversationDto {
  return {
    id: row.id,
    type: row.type,
    shopId: row.shopId,
    shopName: row.shopName,
    title: row.title,
    updatedAt: isoOf(row.updatedAt) ?? new Date().toISOString(),
    lastMessage: row.lastMessage ?? row.messages?.[0]?.body ?? null,
    lastMessageAt: isoOf(row.lastMessageAt),
    contextProductId: row.contextProductId ?? null,
    contextOrderId: row.contextOrderId ?? null,
    participants: row.participants.map((p) => ({
      userId: p.userId,
      role: p.role,
      lastReadAt: isoOf(p.lastReadAt),
      lastDeliveredAt: isoOf(p.lastDeliveredAt),
    })),
  };
}

function toMessageDto(r: {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  clientMsgId: string | null;
  createdAt: Date;
  metadataJson: unknown;
  serverSequence?: bigint | number | string;
  kind?: string;
  replyToMessageId?: string | null;
}): Omit<ChatMessageDto, 'status'> & { status: ChatMessageDto['status'] } {
  return {
    id: r.id,
    conversationId: r.conversationId,
    senderId: r.senderId,
    body: r.body,
    clientMsgId: r.clientMsgId,
    createdAt: r.createdAt.toISOString(),
    status: 'sent',
    metadata: (r.metadataJson as Record<string, unknown>) ?? {},
    serverSequence: r.serverSequence != null ? String(r.serverSequence) : undefined,
    kind: r.kind,
    replyToMessageId: r.replyToMessageId ?? null,
  };
}

function cursorWhere(cursor: { createdAt: Date; id: string }, dir: 'before' | 'after') {
  if (dir === 'before') {
    return {
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ],
    };
  }
  return {
    OR: [
      { createdAt: { gt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { gt: cursor.id } },
    ],
  };
}

export type ListMessagesOpts = {
  limit?: number;
  /** Load older than this message id */
  before?: string;
  /** Catch-up: messages newer than this message id */
  after?: string;
  afterSequence?: string;
  beforeSequence?: string;
  userId?: string;
};

function parseSeq(raw?: string): bigint | undefined {
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  try {
    return BigInt(raw);
  } catch {
    return undefined;
  }
}

export async function listMessagePage(
  conversationId: string,
  opts: ListMessagesOpts = {},
): Promise<ChatMessagePage> {
  const limit = clampLimit(opts.limit);
  const afterSeq = parseSeq(opts.afterSequence);
  const beforeSeq = parseSeq(opts.beforeSequence);

  if ((await prismaChatReady()) && opts.userId && (afterSeq != null || beforeSeq != null)) {
    if (afterSeq != null) {
      const messages = await chatService.syncMessages(opts.userId, conversationId, afterSeq, limit);
      return { messages: [...messages].reverse(), hasMore: messages.length === limit };
    }
    const page = await chatService.getHistory(opts.userId, conversationId, beforeSeq, limit);
    return { messages: [...page.messages].reverse(), hasMore: page.hasMore };
  }

  const participants = await loadParticipants(conversationId);

  if (await prismaChatReady()) {
    let cursor: { createdAt: Date; id: string } | null = null;
    const cursorId = opts.before || opts.after;
    if (cursorId) {
      const row = await prisma.chatMessage.findFirst({
        where: {
          conversationId,
          OR: [{ id: cursorId }, { clientMsgId: cursorId }],
        },
        select: { id: true, createdAt: true },
      });
      if (row) cursor = row;
    }

    const rows = await prisma.chatMessage.findMany({
      where: {
        conversationId,
        status: { not: 'DELETED' },
        ...(cursor ? cursorWhere(cursor, opts.after ? 'after' : 'before') : {}),
      },
      orderBy: opts.after
        ? [{ createdAt: 'asc' }, { id: 'asc' }]
        : [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const newestFirst = opts.after ? [...sliced].reverse() : sliced;
    return {
      messages: newestFirst.map((r) =>
        withReceipts(toMessageDto(r), participants, r.status === 'DELETED'),
      ),
      hasMore,
    };
  }

  const store = readJson();
  let rows = store.messages
    .filter((m) => m.conversationId === conversationId && m.status !== 'deleted')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  if (opts.before || opts.after) {
    const cursorId = opts.before || opts.after;
    const idx = rows.findIndex((m) => m.id === cursorId || m.clientMsgId === cursorId);
    if (idx >= 0) {
      rows = opts.after ? rows.slice(0, idx) : rows.slice(idx + 1);
    }
  }
  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit).map((m) => withReceipts(m, participants, m.status === 'deleted'));
  return { messages, hasMore };
}

export async function listMessages(
  conversationId: string,
  limitOrOpts: number | ListMessagesOpts = PAGE_DEFAULT,
): Promise<ChatMessageDto[]> {
  const opts = typeof limitOrOpts === 'number' ? { limit: limitOrOpts } : limitOrOpts;
  const page = await listMessagePage(conversationId, opts);
  return page.messages;
}

/** Drain leftover cache-before-persist items (legacy). New sends write DB first. */
export async function flushCachedMessages(batchSize = 50): Promise<{ flushed: number }> {
  const batch = await popPendingBatch(batchSize);
  if (!batch.length) return { flushed: 0 };

  for (const msg of batch) {
    try {
      await persistChatMessage({
        conversationId: msg.conversationId,
        senderId: msg.senderId,
        body: msg.body,
        clientMsgId: msg.clientMsgId ?? msg.id,
        metadata: msg.metadata,
      });
    } catch (e) {
      console.warn('[chat-flush]', e);
    }
  }
  return { flushed: batch.length };
}

export async function getChatRuntimeStatus() {
  const db = await prismaChatReady();
  return {
    redisUrlConfigured: Boolean(getRedisUrl()),
    pendingCachedMessages: await pendingDepth(),
    prismaChatReady: db,
    sourceOfTruth: db ? 'postgresql' : 'json-fallback',
    persistOnSend: true,
    transport: 'socket.io',
    realtimeRole: 'notify-only',
    inbox: 'unified',
    conversationTypes: ['DIRECT', 'SHOP', 'GROUP'],
    horizontalScaling: Boolean(getRedisUrl()) ? 'redis-adapter' : 'single-node-memory',
    media: {
      storage: isObjectStorageConfigured() ? 's3' : 'local',
      presign: isObjectStorageConfigured(),
      maxBytes: 12 * 1024 * 1024,
    },
  };
}

let flushTimer: ReturnType<typeof setInterval> | null = null;

export function startChatFlushWorker(intervalMs = 5000) {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushCachedMessages(80).catch((e) => console.warn('[chat-flush]', e));
  }, intervalMs);
  flushTimer.unref?.();
}

export function stopChatFlushWorker() {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
}
