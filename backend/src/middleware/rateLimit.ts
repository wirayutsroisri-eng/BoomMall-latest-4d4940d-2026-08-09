/**
 * Fixed-window rate limiting.
 *
 * Uses Redis when REDIS_URL is set so the limit holds across instances, and an
 * in-memory window otherwise (single instance, still better than nothing).
 * Limits are per identity: the authenticated user when known, else the client IP.
 */

import type { NextFunction, Request, Response } from 'express';
import { getRedisClient } from '../lib/redis';
import { AppError } from '../lib/errors';

type Bucket = { count: number; resetAt: number };

const memory = new Map<string, Bucket>();

function memoryHit(key: string, windowMs: number): Bucket {
  const now = Date.now();
  const existing = memory.get(key);
  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + windowMs };
    memory.set(key, fresh);
    return fresh;
  }
  existing.count += 1;
  return existing;
}

/** Keeps the memory map from growing without bound on a long-lived process. */
function sweepMemory() {
  if (memory.size < 10_000) return;
  const now = Date.now();
  for (const [key, bucket] of memory) {
    if (bucket.resetAt <= now) memory.delete(key);
  }
}

async function redisHit(key: string, windowMs: number): Promise<Bucket | null> {
  const client = await getRedisClient();
  if (!client) return null;
  try {
    const count = await client.incr(key);
    if (count === 1) await client.pExpire(key, windowMs);
    const ttl = await client.pTTL(key);
    return { count, resetAt: Date.now() + (ttl > 0 ? ttl : windowMs) };
  } catch {
    return null;
  }
}

function identityOf(req: Request): string {
  const user = (req as { user?: { sub?: string } }).user?.sub;
  if (user) return `u:${user}`;
  const forwarded = req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return `ip:${forwarded || req.ip || 'unknown'}`;
}

export type RateLimitOptions = {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Requests allowed per identity per window. */
  max: number;
  /** Bucket name — keep distinct per route group. */
  name: string;
};

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, name } = options;
  return async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
      const key = `rl:${name}:${identityOf(req)}:${Math.floor(Date.now() / windowMs)}`;
      const bucket = (await redisHit(key, windowMs)) ?? memoryHit(key, windowMs);
      sweepMemory();

      const remaining = Math.max(0, max - bucket.count);
      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', String(remaining));
      res.setHeader('RateLimit-Reset', String(Math.ceil((bucket.resetAt - Date.now()) / 1000)));

      if (bucket.count > max) {
        res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - Date.now()) / 1000)));
        next(new AppError('RATE_LIMITED', 'คำขอถี่เกินไป กรุณาลองใหม่อีกครั้งในอีกสักครู่', 429));
        return;
      }
      next();
    } catch {
      // A limiter must never take the API down with it.
      next();
    }
  };
}

/** Sensible presets — write paths are much tighter than reads. */
export const rateLimits = {
  /** Login / register / OTP: slow enough to make credential stuffing useless. */
  auth: rateLimit({ name: 'auth', windowMs: 60_000, max: 20 }),
  /** Creating posts, comments, listings. */
  write: rateLimit({ name: 'write', windowMs: 60_000, max: 30 }),
  /** Media upload handshakes. */
  upload: rateLimit({ name: 'upload', windowMs: 60_000, max: 60 }),
  /** Feed signal batches — one per 10s per session is the norm. */
  events: rateLimit({ name: 'events', windowMs: 60_000, max: 60 }),
  /** Everything else on the public app API. */
  general: rateLimit({ name: 'general', windowMs: 60_000, max: 300 }),
};
