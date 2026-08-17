import { Router } from 'express';
import { requireUser } from '../../../middleware/userAuth';
import type { UserAuthedRequest } from '../../../middleware/userAuth';
import { pushDomainStatus, registerPushDevice, unregisterPushDevice } from '../PushService';

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
