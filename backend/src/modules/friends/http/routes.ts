import { Router } from 'express';
import { requireUser, type UserAuthedRequest } from '../../../middleware/userAuth';
import { AppError } from '../../../lib/errors';
import {
  createFriendInvite,
  getMyFriendIdentity,
  listContacts,
  listFriendRequests,
  resolveFriendInvite,
  respondFriendRequest,
  searchPeople,
  sendFriendRequest,
} from '../FriendService';

export const friendRouter = Router();
friendRouter.use(requireUser);

const attempts = new Map<string, { count: number; resetAt: number }>();
function limit(req: UserAuthedRequest) {
  const key = req.user!.sub;
  const now = Date.now();
  const row = attempts.get(key);
  if (!row || row.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  row.count += 1;
  if (row.count > 30) throw new AppError('RATE_LIMITED', 'ลองใหม่อีกครั้งในหนึ่งนาที', 429);
}

friendRouter.get('/me', async (req: UserAuthedRequest, res, next) => {
  try { res.json({ ok: true, data: await getMyFriendIdentity(req.user!.sub) }); } catch (e) { next(e); }
});
friendRouter.get('/search', async (req: UserAuthedRequest, res, next) => {
  try { limit(req); res.json({ ok: true, data: await searchPeople(req.user!.sub, String(req.query.q ?? '')) }); } catch (e) { next(e); }
});
friendRouter.post('/invites', async (req: UserAuthedRequest, res, next) => {
  try { res.status(201).json({ ok: true, data: await createFriendInvite(req.user!.sub, Number(req.body?.ttlHours ?? 24)) }); } catch (e) { next(e); }
});
friendRouter.post('/invites/resolve', async (req: UserAuthedRequest, res, next) => {
  try { limit(req); res.json({ ok: true, data: await resolveFriendInvite(req.user!.sub, String(req.body?.token ?? '')) }); } catch (e) { next(e); }
});
friendRouter.get('/requests', async (req: UserAuthedRequest, res, next) => {
  try { res.json({ ok: true, data: await listFriendRequests(req.user!.sub) }); } catch (e) { next(e); }
});
friendRouter.post('/requests', async (req: UserAuthedRequest, res, next) => {
  try { limit(req); res.status(201).json({ ok: true, data: await sendFriendRequest(req.user!.sub, String(req.body?.receiverId ?? ''), req.body?.message ? String(req.body.message) : undefined) }); } catch (e) { next(e); }
});
friendRouter.post('/requests/:id/respond', async (req: UserAuthedRequest, res, next) => {
  try { res.json({ ok: true, data: await respondFriendRequest(req.user!.sub, BigInt(String(req.params.id)), req.body?.action === 'accept') }); } catch (e) { next(e); }
});
friendRouter.get('/contacts', async (req: UserAuthedRequest, res, next) => {
  try { res.json({ ok: true, data: await listContacts(req.user!.sub) }); } catch (e) { next(e); }
});
