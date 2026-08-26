import * as SQLite from 'expo-sqlite';
import type { ChatMessage, Conversation } from '../domain/types';

const DB_NAME = 'boommall_chat_cache.db';
const MAX_MESSAGES = 80;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS chat_inbox (
          id TEXT PRIMARY KEY NOT NULL,
          json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS chat_threads (
          conversation_id TEXT PRIMARY KEY NOT NULL,
          json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS chat_messages (
          client_msg_id TEXT PRIMARY KEY NOT NULL,
          conversation_id TEXT NOT NULL,
          sender_id TEXT,
          sequence INTEGER NOT NULL DEFAULT 0,
          text TEXT,
          status TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          json TEXT
        );
        CREATE INDEX IF NOT EXISTS chat_messages_conv_seq
          ON chat_messages(conversation_id, sequence);
      `);
      return db;
    })();
  }
  return dbPromise;
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function loadCachedInbox(): Promise<Conversation[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ json: string }>(
      'SELECT json FROM chat_inbox ORDER BY updated_at DESC',
    );
    return rows
      .map((row) => parseJson<Conversation>(row.json))
      .filter((row): row is Conversation => Boolean(row?.id && row.remoteId));
  } catch {
    return [];
  }
}

export async function saveCachedInbox(conversations: Conversation[]) {
  const rows = conversations.filter((c) => Boolean(c.remoteId));
  try {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM chat_inbox');
      for (const row of rows) {
        await db.runAsync(
          'INSERT OR REPLACE INTO chat_inbox (id, json, updated_at) VALUES (?, ?, ?)',
          row.id,
          JSON.stringify(row),
          new Date().toISOString(),
        );
      }
    });
  } catch {
    /* cache is best-effort */
  }
}

/** Remove every account-owned chat cache before another account can hydrate it. */
export async function clearChatCache() {
  try {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM chat_messages');
      await db.runAsync('DELETE FROM chat_threads');
      await db.runAsync('DELETE FROM chat_inbox');
    });
  } catch {
    /* cache cleanup is best-effort; the in-memory store is reset separately */
  }
}

export async function loadCachedThread(conversationId: string): Promise<ChatMessage[]> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ json: string }>(
      'SELECT json FROM chat_threads WHERE conversation_id = ?',
      conversationId,
    );
    const messages = row ? parseJson<ChatMessage[]>(row.json) : null;
    return Array.isArray(messages) ? messages : [];
  } catch {
    return [];
  }
}

export async function loadAllCachedThreads(): Promise<Record<string, ChatMessage[]>> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ conversation_id: string; json: string }>(
      'SELECT conversation_id, json FROM chat_threads',
    );
    const out: Record<string, ChatMessage[]> = {};
    for (const row of rows) {
      const messages = parseJson<ChatMessage[]>(row.json);
      if (Array.isArray(messages) && messages.length) out[row.conversation_id] = messages;
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveCachedThread(conversationId: string, messages: ChatMessage[]) {
  if (!conversationId) return;
  const keep = messages.slice(-MAX_MESSAGES);
  try {
    const db = await getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO chat_threads (conversation_id, json, updated_at) VALUES (?, ?, ?)',
      conversationId,
      JSON.stringify(keep),
      new Date().toISOString(),
    );
    for (const message of keep) {
      await upsertCachedMessageRow(db, conversationId, message);
    }
  } catch {
    /* cache is best-effort */
  }
}

async function upsertCachedMessageRow(
  db: SQLite.SQLiteDatabase,
  conversationId: string,
  message: ChatMessage,
) {
  const clientMsgId = message.clientMsgId || message.id;
  if (!clientMsgId) return;
  const sequence = Number(message.serverSequence ?? 0);
  await db.runAsync(
    `INSERT OR REPLACE INTO chat_messages
      (client_msg_id, conversation_id, sender_id, sequence, text, status, created_at, json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    clientMsgId,
    conversationId,
    message.senderId,
    Number.isFinite(sequence) ? sequence : 0,
    message.text ?? '',
    message.deliveryStatus ?? 'sent',
    message.createdAtIso ? Date.parse(message.createdAtIso) || Date.now() : Date.now(),
    JSON.stringify(message),
  );
}

export async function lastCachedSequence(conversationId: string): Promise<number> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ maxSeq: number | null }>(
      'SELECT MAX(sequence) as maxSeq FROM chat_messages WHERE conversation_id = ? AND sequence > 0',
      conversationId,
    );
    return Number(row?.maxSeq ?? 0) || 0;
  } catch {
    return 0;
  }
}

export async function updateCachedMessageStatus(
  clientMsgId: string,
  status: ChatMessage['deliveryStatus'],
  sequence = 0,
) {
  try {
    const db = await getDb();
    await db.runAsync(
      'UPDATE chat_messages SET status = ?, sequence = CASE WHEN ? > 0 THEN ? ELSE sequence END WHERE client_msg_id = ?',
      status ?? 'sent',
      sequence,
      sequence,
      clientMsgId,
    );
  } catch {
    /* cache is best-effort */
  }
}
