/**
 * In-memory feed ranking cache + best-effort Redis flush.
 * Redis is optional (REDIS_URL). Always clears local cache on config publish.
 */

type CacheEntry = { at: number; payload: unknown };

const memory = new Map<string, CacheEntry>();
const TTL_MS = 60_000;
const REDIS_PREFIX = 'feed:rank:';

export function getCachedRank(key: string): unknown | null {
  const hit = memory.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    memory.delete(key);
    return null;
  }
  return hit.payload;
}

export function setCachedRank(key: string, payload: unknown) {
  memory.set(key, { at: Date.now(), payload });
}

/** Flush ranking cache after admin config publish */
export async function flushFeedRankingCache(): Promise<{
  memoryCleared: number;
  redis: 'flushed' | 'skipped' | 'error';
  detail?: string;
}> {
  const n = memory.size;
  memory.clear();

  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    return { memoryCleared: n, redis: 'skipped', detail: 'REDIS_URL not set' };
  }

  try {
    // Optional dependency — avoid hard fail if redis package absent
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await (Function('return import("redis")')() as Promise<unknown>).catch(
      () => null,
    );
    if (!mod?.createClient) {
      return {
        memoryCleared: n,
        redis: 'skipped',
        detail: 'redis package not installed — memory cache cleared',
      };
    }
    const client = mod.createClient({ url });
    await client.connect();
    const keys: string[] = [];
    for await (const key of client.scanIterator({ MATCH: `${REDIS_PREFIX}*`, COUNT: 100 })) {
      keys.push(typeof key === 'string' ? key : String(key));
    }
    if (keys.length) await client.del(keys);
    await client.quit();
    return { memoryCleared: n, redis: 'flushed', detail: `deleted ${keys.length} keys` };
  } catch (e) {
    return {
      memoryCleared: n,
      redis: 'error',
      detail: e instanceof Error ? e.message : 'redis flush failed',
    };
  }
}
