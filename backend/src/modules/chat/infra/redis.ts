/**
 * Chat's Redis entry point. The implementation moved to `src/lib/redis.ts` so
 * Feed serving can share one connection; this re-export keeps chat imports intact.
 */

export { getRedisUrl, getRedisClient, duplicateRedisClient } from '../../../lib/redis';
