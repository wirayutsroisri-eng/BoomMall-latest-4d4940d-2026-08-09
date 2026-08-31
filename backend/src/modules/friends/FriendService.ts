import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { ensureDirectConversation } from '../chat/services/ChatService';
import { computeTrust, computeTrusts, DEFAULT_TRUST, type TrustInfo } from '../profile/TrustService';

const profileSelect = {
  userId: true,
  snowflakeId: true,
  friendCode: true,
  handle: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  privacyJson: true,
} as const;

function publicProfile(row: Awaited<ReturnType<typeof prisma.userProfile.findFirstOrThrow>>, trust: TrustInfo = DEFAULT_TRUST) {
  const profile = row as unknown as Record<string, unknown>;
  return {
    userId: String(profile.userId),
    snowflakeId: typeof profile.snowflakeId === 'bigint' ? profile.snowflakeId.toString() : undefined,
    friendCode: String(profile.friendCode),
    handle: typeof profile.handle === 'string' ? profile.handle : null,
    displayName: typeof profile.displayName === 'string' ? profile.displayName : 'ผู้ใช้ BoomMall',
    avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : null,
    bio: typeof profile.bio === 'string' ? profile.bio : null,
    trust,
  };
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join(':');
}

function hashToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function canFind(profile: { privacyJson: unknown }, viewerId: string, ownerId: string) {
  if (viewerId === ownerId) return true;
  const privacy = profile.privacyJson && typeof profile.privacyJson === 'object'
    ? profile.privacyJson as Record<string, unknown>
    : {};
  return privacy.findByHandle !== 'noone';
}

export async function getMyFriendIdentity(userId: string) {
  const row = await prisma.userProfile.findUnique({ where: { userId }, select: profileSelect });
  if (!row) throw new AppError('NOT_FOUND', 'ไม่พบบัญชีผู้ใช้', 404);
  const trust = await computeTrust(userId);
  return publicProfile(row as never, trust);
}

export async function searchPeople(viewerId: string, rawQuery: string) {
  const query = rawQuery.trim().replace(/^@/, '');
  if (query.length < 3 || query.length > 40) {
    throw new AppError('VALIDATION', 'กรุณากรอกอย่างน้อย 3 ตัวอักษร', 400);
  }
  const normalizedCode = query.toUpperCase();
  const rows = await prisma.userProfile.findMany({
    where: {
      userId: { not: viewerId },
      OR: [
        { friendCode: normalizedCode },
        { handle: { startsWith: query.toLowerCase(), mode: 'insensitive' } },
        { displayName: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: profileSelect,
    take: 20,
    orderBy: { createdAt: 'asc' },
  });
  const visible = rows.filter((row) => canFind(row, viewerId, row.userId));
  const trustMap = await computeTrusts(visible.map((row) => row.userId));
  return visible.map((row) => publicProfile(row as never, trustMap.get(row.userId) ?? DEFAULT_TRUST));
}

export async function createFriendInvite(userId: string, ttlHours = 24) {
  await getMyFriendIdentity(userId);
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + Math.min(Math.max(ttlHours, 1), 168) * 3_600_000);
  await prisma.$transaction([
    prisma.friendInvite.updateMany({ where: { ownerUserId: userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.friendInvite.create({ data: { ownerUserId: userId, tokenHash: hashToken(token), expiresAt } }),
  ]);
  return { token, deepLink: `boommall://add-friend?token=${encodeURIComponent(token)}`, expiresAt: expiresAt.toISOString() };
}

export async function resolveFriendInvite(viewerId: string, token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new AppError('VALIDATION', 'QR ไม่ถูกต้อง', 400);
  const invite = await prisma.friendInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { owner: { select: profileSelect } },
  });
  if (!invite || invite.revokedAt || invite.expiresAt <= new Date()) {
    throw new AppError('NOT_FOUND', 'QR หมดอายุหรือถูกยกเลิกแล้ว', 404);
  }
  if (invite.ownerUserId === viewerId) throw new AppError('VALIDATION', 'ไม่สามารถเพิ่มตัวเองเป็นเพื่อนได้', 400);
  const trust = await computeTrust(invite.ownerUserId);
  return publicProfile(invite.owner as never, trust);
}

export async function sendFriendRequest(senderId: string, receiverId: string, message?: string) {
  if (!receiverId || senderId === receiverId) throw new AppError('VALIDATION', 'ผู้รับไม่ถูกต้อง', 400);
  await prisma.userProfile.findUniqueOrThrow({ where: { userId: receiverId }, select: { userId: true } });
  const key = pairKey(senderId, receiverId);
  const existing = await prisma.friendRequest.findUnique({ where: { pairKey: key } });
  if (existing?.status === 'ACCEPTED') return serializeRequest(existing);
  const row = await prisma.friendRequest.upsert({
    where: { pairKey: key },
    create: { pairKey: key, senderId, receiverId, message: message?.trim().slice(0, 200) || null },
    update: { senderId, receiverId, status: 'PENDING', message: message?.trim().slice(0, 200) || null, respondedAt: null },
  });
  return serializeRequest(row);
}

function serializeRequest(row: { id: bigint; senderId: string; receiverId: string; status: string; message: string | null; createdAt: Date; respondedAt: Date | null }) {
  return { ...row, id: row.id.toString(), createdAt: row.createdAt.toISOString(), respondedAt: row.respondedAt?.toISOString() ?? null };
}

export async function listFriendRequests(userId: string) {
  const rows = await prisma.friendRequest.findMany({
    where: { OR: [{ senderId: userId }, { receiverId: userId }] },
    include: { sender: { select: profileSelect }, receiver: { select: profileSelect } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const peerIds = rows.map((row) => (row.receiverId === userId ? row.senderId : row.receiverId));
  const trustMap = await computeTrusts(peerIds);
  return rows.map((row) => {
    const peer = row.receiverId === userId ? row.sender : row.receiver;
    return {
      ...serializeRequest(row),
      direction: row.receiverId === userId ? 'incoming' : 'outgoing',
      peer: publicProfile(peer as never, trustMap.get(peer.userId) ?? DEFAULT_TRUST),
    };
  });
}

export async function respondFriendRequest(userId: string, id: bigint, accept: boolean) {
  const request = await prisma.friendRequest.findUnique({ where: { id } });
  if (!request || request.receiverId !== userId) throw new AppError('NOT_FOUND', 'ไม่พบคำขอเป็นเพื่อน', 404);
  if (request.status !== 'PENDING') throw new AppError('CONFLICT', 'คำขอนี้ถูกตอบแล้ว', 409);
  const status = accept ? 'ACCEPTED' as const : 'REJECTED' as const;
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.friendRequest.updateMany({
      where: { id, receiverId: userId, status: 'PENDING' },
      data: { status, respondedAt: new Date() },
    });
    if (changed.count !== 1) throw new AppError('CONFLICT', 'คำขอนี้ถูกตอบแล้ว', 409);
    if (accept) {
      await tx.contact.createMany({
        data: [
          { userId: request.senderId, contactId: request.receiverId },
          { userId: request.receiverId, contactId: request.senderId },
        ],
        skipDuplicates: true,
      });
    }
    return tx.friendRequest.findUniqueOrThrow({ where: { id } });
  });
  if (accept) await ensureDirectConversation({ userId: request.senderId, peerUserId: request.receiverId });
  return serializeRequest(updated);
}

export async function listContacts(userId: string) {
  const rows = await prisma.contact.findMany({
    where: { userId },
    include: { contact: { select: profileSelect } },
    orderBy: [{ isFavorite: 'desc' }, { createdAt: 'desc' }],
  });
  const trustMap = await computeTrusts(rows.map((row) => row.contact.userId));
  return rows.map((row) => ({ id: row.id.toString(), nickname: row.nickname, isFavorite: row.isFavorite, createdAt: row.createdAt.toISOString(), profile: publicProfile(row.contact as never, trustMap.get(row.contact.userId) ?? DEFAULT_TRUST) }));
}
