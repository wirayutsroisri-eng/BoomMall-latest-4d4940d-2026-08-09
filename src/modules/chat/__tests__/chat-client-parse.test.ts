import { describe, expect, it } from 'vitest';
import { parsePersistedChatMessage, parseSyncMessages, readApiError } from '../domain/chat-api-parse';
import { attachmentsToMessageFields, nextImageCompressStep } from '../domain/chat-media';

describe('chat client parse', () => {
  it('reads persisted message from message or data', () => {
    const message = {
      id: 'm1',
      conversationId: 'c1',
      senderId: 'u1',
      body: 'hi',
      createdAt: '2026-08-14T10:00:00.000Z',
      status: 'sent',
      serverSequence: '3',
    };
    expect(parsePersistedChatMessage({ ok: true, message, data: message })?.id).toBe('m1');
    expect(parsePersistedChatMessage({ ok: true, data: message })?.serverSequence).toBe('3');
  });

  it('prefers chronological sync messages over newest-first data', () => {
    const older = {
      id: 'm1',
      conversationId: 'c1',
      senderId: 'u1',
      body: 'a',
      createdAt: '2026-08-14T10:00:00.000Z',
      status: 'sent',
      serverSequence: '1',
    };
    const newer = { ...older, id: 'm2', body: 'b', serverSequence: '2' };
    const rows = parseSyncMessages({ ok: true, messages: [older, newer], data: [newer, older] });
    expect(rows.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('reads API error codes from the handler envelope', () => {
    expect(readApiError({ error: { code: 'CHAT_NOT_MEMBER' } }, 'fallback')).toBe('CHAT_NOT_MEMBER');
    expect(readApiError({ error: 'CHAT_SEND_FAILED' }, 'fallback')).toBe('CHAT_SEND_FAILED');
  });
});

describe('chat media mapping', () => {
  it('maps image attachments onto album fields', () => {
    const fields = attachmentsToMessageFields([
      { url: 'https://cdn/a.jpg', mimeType: 'image/jpeg' },
      { url: 'https://cdn/b.jpg', mimeType: 'image/jpeg' },
    ]);
    expect(fields.kind).toBe('image');
    expect(fields.imageUris).toEqual(['https://cdn/a.jpg', 'https://cdn/b.jpg']);
  });

  it('steps jpeg quality down until the 1–2 MB target', () => {
    expect(nextImageCompressStep(1600, 0.72)).toEqual({ width: 1600, quality: 0.6 });
    expect(nextImageCompressStep(1600, 0.42)).toEqual({ width: 1360, quality: 0.55 });
    expect(nextImageCompressStep(800, 0.4)).toBeNull();
  });
});
