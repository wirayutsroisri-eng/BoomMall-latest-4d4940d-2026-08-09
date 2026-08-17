/**
 * Optional Redis/memory recent list — never the source of truth.
 * Legacy pending queue is only drained into Postgres by the flush worker.
 */

import { getRedisClient } from '../infra/redis';
import type { ChatMessageDto } from '../types';

const PENDING_KEY = 'chat:msg:pending';
const recentKey = (conversationId: string) => `chat:msg:conv:${conversationId}:recent`;
const RECENT_MAX = 100;

const memoryPending: ChatMessageDto[] = [];
const memoryRecent = new Map<string, ChatMessageDto[]>();

/** Best-effort recent cache after a successful DB write. Must never fail send. */
export async function rememberPersistedMessage(msg: ChatMessageDto): Promise<void> {
  try {
    const redis = await getRedisClient();
    const raw = JSON.stringify(msg);
    if (redis) {
      await redis.lPush(recentKey(msg.conversationId), raw);
      await redis.lTrim(recentKey(msg.conversationId), 0, RECENT_MAX - 1);
      await redis.expire(recentKey(msg.conversationId), 86_400);
      return;
    }
    const list = memoryRecent.get(msg.conversationId) ?? [];
    list.unshift(msg);
    memoryRecent.set(msg.conversationId, list.slice(0, RECENT_MAX));
  } catch {
    /* cache is optional */
  }
}

export async function popPendingBatch(limit = 50): Promise<ChatMessageDto[]> {
  const redis = await getRedisClient();
  if (!redis) {
    return memoryPending.splice(0, limit);
  }

  const out: ChatMessageDto[] = [];
  for (let i = 0; i < limit; i++) {
    const raw = await redis.lPop(PENDING_KEY);
    if (!raw) break;
    try {
      out.push(JSON.parse(raw) as ChatMessageDto);
    } catch {
      /* skip bad */
    }
  }
  return out;
}

export async function pendingDepth(): Promise<number> {
  const redis = await getRedisClient();
  if (!redis) return memoryPending.length;
  return redis.lLen(PENDING_KEY);
}
