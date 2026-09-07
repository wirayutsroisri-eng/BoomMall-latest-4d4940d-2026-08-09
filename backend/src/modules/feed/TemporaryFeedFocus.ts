import { getRedisClient, getRedisUrl } from '../../lib/redis';
import { AppError } from '../../lib/errors';

export type TemporaryFeedFocus = { mode: 'temporary_focus'; query: string; targetWeight: 0.75 };
const memory = new Map<string, TemporaryFeedFocus>();
export function focusKey(userId: string, sessionId: string) {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(sessionId)) throw new AppError('VALIDATION', 'Invalid feed session', 400);
  return `feed:focus:${encodeURIComponent(userId)}:${sessionId}`;
}
async function storage() {
  const redis = await getRedisClient();
  // Never silently split session state across workers when Redis is configured.
  if (getRedisUrl() && !redis) throw new AppError('UNAVAILABLE', 'Feed session unavailable', 503);
  return redis;
}
export async function readFeedFocus(userId: string, sessionId: string): Promise<TemporaryFeedFocus | null> {
  const key = focusKey(userId, sessionId);
  const redis = await storage();
  const raw = redis ? await redis.get(key) : null;
  const focus: TemporaryFeedFocus | undefined = redis ? (raw ? JSON.parse(raw) : undefined) : memory.get(key);
  return focus ?? null;
}
export async function writeFeedFocus(userId: string, sessionId: string, query: unknown) {
  const key = focusKey(userId, sessionId);
  if (query !== null && (typeof query !== 'string' || !query.trim() || query.trim().length > 100)) {
    throw new AppError('VALIDATION', 'Focus query must be 1–100 characters', 400);
  }
  const focus: TemporaryFeedFocus | null = query === null ? null : {
    mode: 'temporary_focus', query: (query as string).trim().normalize('NFKC'), targetWeight: 0.75,
  };
  const redis = await storage();
  if (redis) {
    if (focus) await redis.set(key, JSON.stringify(focus));
    else await redis.del(key);
  } else {
    if (focus) memory.set(key, focus); else memory.delete(key);
  }
  return focus;
}

/** Preserve normal ranking inside each pool; three focused slots, one discovery slot. */
export function mixFeedFocus<T>(rows: T[], matches: (row: T) => boolean, limit: number): T[] {
  const focused = rows.filter(matches);
  const discovery = rows.filter((row) => !matches(row));
  const result: T[] = [];
  let f = 0, d = 0;
  while (result.length < limit && (f < focused.length || d < discovery.length)) {
    const preferFocus = result.length % 4 !== 3;
    if ((preferFocus && f < focused.length) || d >= discovery.length) result.push(focused[f++]);
    else result.push(discovery[d++]);
  }
  return result;
}
export function matchesFocusText(query: string, body: string, tags: string[]) {
  const needle = query.normalize('NFKC').toLocaleLowerCase();
  return [body, ...tags].some((value) => value.normalize('NFKC').toLocaleLowerCase().includes(needle));
}
