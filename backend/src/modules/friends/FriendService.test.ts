import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  userProfile: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn() },
  friendInvite: { create: vi.fn(), findUnique: vi.fn() },
  friendRequest: { upsert: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn() },
  contact: { createMany: vi.fn() },
  $transaction: vi.fn(),
}));
const chat = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
vi.mock('../notify/PushService', () => ({ sendPushToUsers: push }));
vi.mock('../../lib/prisma', () => ({ prisma: db }));
vi.mock('../chat/services/ChatService', () => ({ ensureDirectConversation: chat }));
vi.mock('../profile/TrustService', () => ({ computeTrust: vi.fn(), computeTrusts: async () => new Map(), DEFAULT_TRUST: {} }));
import { createFriendInvite, listFriendRequests, resolveFriendInvite, respondFriendRequest, searchPeople, sendFriendRequest } from './FriendService';

const profile = { userId: 'bob', snowflakeId: 123456789012345678n, friendCode: 'BM123456', handle: 'bob', displayName: 'Bob', privacyJson: {} };
const pending = { id: 1n, senderId: 'alice', receiverId: 'bob', status: 'PENDING', message: null, createdAt: new Date(), respondedAt: null };
beforeEach(() => {
  vi.clearAllMocks();
  push.mockResolvedValue({ sent: 1 });
  chat.mockResolvedValue({ id: 'conversation-1' });
  db.userProfile.findUnique.mockResolvedValue(profile);
  db.userProfile.findUniqueOrThrow.mockResolvedValue(profile);
  db.userProfile.findMany.mockResolvedValue([profile]);
  db.friendRequest.upsert.mockResolvedValue({ ...pending });
  db.friendRequest.findUnique.mockResolvedValue({ ...pending });
  db.friendRequest.updateMany.mockResolvedValue({ count: 1 });
  db.friendRequest.findUniqueOrThrow.mockResolvedValue({ ...pending, status: 'ACCEPTED' });
  db.$transaction.mockImplementation((fn) => fn(db));
});

describe('friend discovery across accounts', () => {
  it('notifies only the recipient after saving a new request', async () => {
    db.friendRequest.findUnique.mockResolvedValueOnce(null);
    await sendFriendRequest('alice', 'bob');
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['bob'], channelId: 'app-alerts', data: { type: 'friend-request', requestId: '1', recipientId: 'bob' } }));
    expect(db.friendRequest.upsert.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]);
  });
  it('does not resend a push for a repeated pending request', async () => {
    await sendFriendRequest('alice', 'bob');
    expect(push).not.toHaveBeenCalled();
  });
  it('keeps a persisted request successful if push delivery fails', async () => {
    db.friendRequest.findUnique.mockResolvedValueOnce(null);
    push.mockRejectedValueOnce(new Error('push unavailable'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try { expect((await sendFriendRequest('alice', 'bob')).status).toBe('PENDING'); }
    finally { warning.mockRestore(); }
  });
  it('returns the direct chat and notifies the original sender on acceptance', async () => {
    expect(await respondFriendRequest('bob', 1n, true)).toMatchObject({ conversationId: 'conversation-1', status: 'ACCEPTED' });
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['alice'], data: { type: 'friend-accepted', requestId: '1', recipientId: 'alice', conversationId: 'conversation-1' } }));
  });
  it('recovers a committed acceptance when chat creation failed on the previous attempt', async () => {
    chat.mockRejectedValueOnce(new Error('chat unavailable'));
    await expect(respondFriendRequest('bob', 1n, true)).rejects.toThrow('chat unavailable');
    db.friendRequest.findUnique.mockResolvedValueOnce({ ...pending, status: 'ACCEPTED' });
    expect(await respondFriendRequest('bob', 1n, true)).toMatchObject({ conversationId: 'conversation-1' });
    expect(db.contact.createMany).toHaveBeenCalledTimes(1);
  });
  it('searches numeric IDs without losing precision', async () => {
    const result = await searchPeople('alice', '123456789012345678');
    expect(db.userProfile.findMany.mock.calls[0][0].where.OR).toContainEqual({ snowflakeId: 123456789012345678n });
    expect(result[0].snowflakeId).toBe('123456789012345678');
  });
  it('normalizes handles and friend codes while preserving search privacy', async () => {
    db.userProfile.findMany.mockResolvedValue([{ ...profile, privacyJson: { findByHandle: 'noone' } }]);
    expect(await searchPeople('alice', ' @bm123456 ')).toEqual([]);
    expect(db.userProfile.findMany.mock.calls[0][0].where.OR).toContainEqual({ friendCode: 'BM123456' });
  });
  it('does not pass out-of-range IDs to PostgreSQL', async () => {
    await searchPeople('alice', '9999999999999999999');
    expect(db.userProfile.findMany.mock.calls[0][0].where.OR.some((r: object) => 'snowflakeId' in r)).toBe(false);
  });
  it('keeps two displayed QR codes resolvable until expiry', async () => {
    const invites = new Map();
    db.friendInvite.create.mockImplementation(async ({ data }) => { invites.set(data.tokenHash, { ...data, owner: profile }); });
    db.friendInvite.findUnique.mockImplementation(async ({ where }) => invites.get(where.tokenHash));
    const first = await createFriendInvite('bob');
    const second = await createFriendInvite('bob');
    expect(first.token).not.toBe(second.token);
    expect((await resolveFriendInvite('alice', first.token)).userId).toBe('bob');
    expect((await resolveFriendInvite('alice', second.token)).userId).toBe('bob');
    await expect(resolveFriendInvite('bob', first.token)).rejects.toThrow('ไม่สามารถเพิ่มตัวเอง');
    for (const invite of invites.values()) invite.expiresAt = new Date(0);
    await expect(resolveFriendInvite('alice', first.token)).rejects.toThrow('หมดอายุ');
  });
  it('keeps the sender and receiver when a request is repeated or crossed', async () => {
    expect((await sendFriendRequest('alice', 'bob')).status).toBe('PENDING');
    await expect(sendFriendRequest('bob', 'alice')).rejects.toThrow('ส่งคำขอถึงคุณแล้ว');
    expect(db.friendRequest.upsert.mock.calls.every(([args]) => Object.keys(args.update).length === 0)).toBe(true);
    expect(db.friendRequest.updateMany).not.toHaveBeenCalled();
  });
  it('shows the same pending request as incoming to the receiving device', async () => {
    db.friendRequest.findMany.mockResolvedValue([{ ...pending, sender: { ...profile, userId: 'alice' }, receiver: profile }]);
    expect((await listFriendRequests('bob'))[0]).toMatchObject({ id: '1', direction: 'incoming', peer: { userId: 'alice' } });
    expect((await listFriendRequests('alice'))[0]).toMatchObject({ id: '1', direction: 'outgoing', peer: { userId: 'bob' } });
  });
  it('accepts only for the recipient and creates contacts for both accounts plus a chat', async () => {
    await expect(respondFriendRequest('alice', 1n, true)).rejects.toThrow('ไม่พบคำขอ');
    await respondFriendRequest('bob', 1n, true);
    expect(db.contact.createMany).toHaveBeenCalledWith({ data: [{ userId: 'alice', contactId: 'bob' }, { userId: 'bob', contactId: 'alice' }], skipDuplicates: true });
    expect(chat).toHaveBeenCalledWith({ userId: 'alice', peerUserId: 'bob' });
  });
  it('does not create friendship or chat when rejected', async () => {
    await respondFriendRequest('bob', 1n, false);
    expect(db.contact.createMany).not.toHaveBeenCalled();
    expect(chat).not.toHaveBeenCalled();
  });
});
