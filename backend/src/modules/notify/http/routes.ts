import { Router } from 'express';
import { requireUser } from '../../../middleware/userAuth';
import type { UserAuthedRequest } from '../../../middleware/userAuth';
import {
  pushDomainStatus,
  registerPushDevice,
  sendPushToUsers,
  unregisterPushDevice,
} from '../PushService';

export const notifyAppRouter = Router();

notifyAppRouter.get('/status', (_req, res) => {
  res.json({ ok: true, data: pushDomainStatus() });
});

notifyAppRouter.post('/devices', requireUser, async (req: UserAuthedRequest, res, next) => {
  try {
    const body = req.body ?? {};
    res.status(201).json({
      ok: true,
      data: await registerPushDevice({
        userId: req.user!.sub,
        token: String(body.token ?? ''),
        platform: body.platform ? String(body.platform) : undefined,
      }),
    });
  } catch (e) {
    next(e);
  }
});

notifyAppRouter.post('/matching', requireUser, async (req: UserAuthedRequest, res, next) => {
  try {
    const body = req.body ?? {};
    const userIds = Array.isArray(body.userIds)
      ? body.userIds.map(String).filter(Boolean)
      : [];
    const title = String(body.title ?? '⚡ มีงานใหม่ใกล้คุณ!');
    const messageBody = String(
      body.body ?? 'มีงานใหม่ใกล้คุณ! กดดูรายละเอียดเพื่อทักแชท',
    );
    if (!userIds.length) {
      res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'userIds required' } });
      return;
    }
    const data: Record<string, string> = { type: 'matching', title, body: messageBody };
    const conversationId = body.conversationId ? String(body.conversationId) : '';
    const feedId = body.feedId ? String(body.feedId) : '';
    if (conversationId) data.conversationId = conversationId;
    if (feedId) data.feedId = feedId;
    res.status(201).json({
      ok: true,
      data: await sendPushToUsers({ userIds, title, body: messageBody, data }),
    });
  } catch (e) {
    next(e);
  }
});

notifyAppRouter.delete('/devices', requireUser, async (req: UserAuthedRequest, res, next) => {
  try {
    res.json({
      ok: true,
      data: await unregisterPushDevice(String(req.body?.token ?? req.query.token ?? '')),
    });
  } catch (e) {
    next(e);
  }
});
