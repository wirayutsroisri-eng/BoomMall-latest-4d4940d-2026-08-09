/**
 * Crash + error reports from the app.
 *
 * Deliberately dependency-free: a TestFlight build must be able to tell us where
 * it broke without shipping a third-party SDK. Reports land in AnalyticsEvent so
 * the existing admin tooling can read them.
 */

import { Router } from 'express';
import { rateLimit } from '../../middleware/rateLimit';
import { recordAnalyticsEvent } from '../ecommerce/EventService';
import type { UserAuthedRequest } from '../../middleware/userAuth';

export const clientErrorRouter = Router();

const MAX_MESSAGE = 500;
const MAX_STACK = 4000;

function trim(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

clientErrorRouter.post(
  '/',
  rateLimit({ name: 'client-errors', windowMs: 60_000, max: 30 }),
  async (req: UserAuthedRequest, res, next) => {
    try {
      const header = req.header('authorization') ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
      if (token) {
        try {
          const { verifyAppJwt } = await import('../auth/JwtService');
          req.user = await verifyAppJwt(token);
        } catch {
          /* an anonymous crash report is still worth having */
        }
      }

      const message = trim(req.body?.message, MAX_MESSAGE);
      if (!message) {
        res.status(202).json({ ok: true, accepted: 0 });
        return;
      }

      await recordAnalyticsEvent({
        userId: req.user?.sub,
        name: 'CLIENT_ERROR',
        entityType: 'APP',
        entityId: trim(req.body?.screen, 100) || undefined,
        payload: {
          message,
          stack: trim(req.body?.stack, MAX_STACK),
          fatal: Boolean(req.body?.fatal),
          platform: trim(req.body?.platform, 20),
          appVersion: trim(req.body?.appVersion, 40),
          buildNumber: trim(req.body?.buildNumber, 20),
          sessionId: trim(req.body?.sessionId, 100),
          at: new Date().toISOString(),
        },
      }).catch(() => undefined);

      res.status(202).json({ ok: true, accepted: 1 });
    } catch (e) {
      next(e);
    }
  },
);
