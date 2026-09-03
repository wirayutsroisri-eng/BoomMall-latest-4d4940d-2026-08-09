/**
 * Shared Redis client for Chat cache, Socket.io adapter and Feed serving.
 * Optional: if REDIS_URL is missing, callers fall back to memory/Postgres.
 */

import { createClient, type RedisClientType } from 'redis';

let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType | null> | null = null;

export function getRedisUrl(): string | null {
  const url = process.env.REDIS_URL?.trim();
  return url || null;
}

export async function getRedisClient(): Promise<RedisClientType | null> {
  const url = getRedisUrl();
  if (!url) return null;
  if (client?.isOpen) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    try {
      const c = createClient({ url }) as RedisClientType;
      c.on('error', (err) => {
        console.warn('[redis]', err.message);
      });
      await c.connect();
      client = c;
      return c;
    } catch (e) {
      console.warn('[redis] connect failed — using memory fallback', e);
      client = null;
      return null;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

export async function duplicateRedisClient(): Promise<RedisClientType | null> {
  const base = await getRedisClient();
  if (!base) return null;
  try {
    const dup = base.duplicate() as RedisClientType;
    if (!dup.isOpen) await dup.connect();
    return dup;
  } catch {
    return null;
  }
}
