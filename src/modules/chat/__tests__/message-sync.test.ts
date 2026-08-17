import { describe, expect, it } from 'vitest';
import {
  advanceConversationSequence,
  deliveryStatusLabel,
  isNewerSequence,
  mergeChatMessages,
  preferDeliveryStatus,
} from '../domain/message-sync';
import type { ChatMessage } from '../domain/types';

describe('chat message sync', () => {
  it('keeps a single row when the same clientMsgId is retried', () => {
    const local: ChatMessage[] = [
      {
        id: 'cmsg-1',
        conversationId: 'c1',
        senderId: 'me',
        kind: 'text',
        text: 'สวัสดี',
        createdAt: 'ตอนนี้',
        deliveryStatus: 'sending',
        clientMsgId: 'cmsg-1',
      },
    ];
    const incoming: ChatMessage[] = [
      {
        id: 'cmsg-1',
        conversationId: 'c1',
        senderId: 'me',
        kind: 'text',
        text: 'สวัสดี',
        createdAt: 'ตอนนี้',
        createdAtIso: '2026-08-14T10:00:00.000Z',
        deliveryStatus: 'sent',
        clientMsgId: 'cmsg-1',
        serverId: 'srv-1',
      },
    ];
    const merged = mergeChatMessages(local, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].serverId).toBe('srv-1');
    expect(merged[0].deliveryStatus).toBe('sent');
  });

  it('does not duplicate when server id and client id both appear', () => {
    const local: ChatMessage[] = [
      {
        id: 'cmsg-1',
        conversationId: 'c1',
        senderId: 'me',
        kind: 'text',
        text: 'สวัสดี',
        createdAt: 'ตอนนี้',
        deliveryStatus: 'sent',
        clientMsgId: 'cmsg-1',
        serverId: 'srv-1',
      },
    ];
    const incoming: ChatMessage[] = [
      {
        id: 'srv-1',
        conversationId: 'c1',
        senderId: 'me',
        kind: 'text',
        text: 'สวัสดี',
        createdAt: '10:00',
        createdAtIso: '2026-08-14T10:00:00.000Z',
        deliveryStatus: 'delivered',
        clientMsgId: 'cmsg-1',
        serverId: 'srv-1',
      },
    ];
    const merged = mergeChatMessages(local, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].deliveryStatus).toBe('delivered');
  });

  it('upgrades sending → sent → delivered → read and never downgrades', () => {
    expect(preferDeliveryStatus('sending', 'sent')).toBe('sent');
    expect(preferDeliveryStatus('sent', 'delivered')).toBe('delivered');
    expect(preferDeliveryStatus('read', 'sent')).toBe('read');
    expect(preferDeliveryStatus('failed', 'sent')).toBe('sent');
  });

  it('labels receipts in Thai', () => {
    expect(deliveryStatusLabel('sending')).toBe('กำลังส่ง');
    expect(deliveryStatusLabel('failed')).toBe('ส่งไม่สำเร็จ');
    expect(deliveryStatusLabel('delivered')).toBe('ถึงแล้ว');
    expect(deliveryStatusLabel('read')).toBe('อ่านแล้ว');
  });
});

describe('chat sequence cursor', () => {
  it('keeps the higher server sequence per conversation', () => {
    const sequences = new Map<string, string>();
    advanceConversationSequence(sequences, 'c1', '10');
    advanceConversationSequence(sequences, 'c1', '8');
    advanceConversationSequence(sequences, 'c1', '12');
    expect(sequences.get('c1')).toBe('12');
  });

  it('ignores empty incoming sequences', () => {
    const sequences = new Map<string, string>();
    advanceConversationSequence(sequences, 'c1', '4');
    advanceConversationSequence(sequences, 'c1', '');
    expect(sequences.get('c1')).toBe('4');
    expect(isNewerSequence('5', '4')).toBe(true);
    expect(isNewerSequence('4', '4')).toBe(false);
  });
});
