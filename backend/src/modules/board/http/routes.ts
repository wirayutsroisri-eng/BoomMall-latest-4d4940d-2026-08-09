import { Router } from 'express';
import { requireAdmin } from '../../../middleware/adminAuth';
import { requireUserOrDevHeader } from '../../../middleware/userAuth';
import type { UserAuthedRequest } from '../../../middleware/userAuth';
import {
  addReply,
  boardDomainStatus,
  createThread,
  getThread,
  hideThread,
  listCategories,
  listThreads,
  pinThread,
  vote,
} from '../BoardService';

export const boardAppRouter = Router();
export const boardAdminRouter = Router();

boardAppRouter.get('/status', (_req, res) => {
  res.json({ ok: true, data: boardDomainStatus() });
});

boardAppRouter.get('/categories', async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await listCategories() });
  } catch (e) {
    next(e);
  }
});

boardAppRouter.get('/threads', async (req, res, next) => {
  try {
    res.json({
      ok: true,
      data: await listThreads({
        categoryId: typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined,
        limit: req.query.limit != null ? Number(req.query.limit) : 40,
      }),
    });
  } catch (e) {
    next(e);
  }
});

boardAppRouter.get('/threads/:id', async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const row = await getThread(String(id));
    if (!row) {
      res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'thread not found' } });
      return;
    }
    res.json({ ok: true, data: row });
  } catch (e) {
    next(e);
  }
});

boardAppRouter.post('/threads', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const body = req.body ?? {};
    res.status(201).json({
      ok: true,
      data: await createThread({
        categoryId: String(body.categoryId ?? ''),
        authorId: req.user!.sub,
        title: String(body.title ?? ''),
        body: String(body.body ?? ''),
      }),
    });
  } catch (e) {
    next(e);
  }
});

boardAppRouter.post(
  '/threads/:id/replies',
  requireUserOrDevHeader,
  async (req: UserAuthedRequest, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const body = req.body ?? {};
      res.status(201).json({
        ok: true,
        data: await addReply({
          threadId: String(id),
          authorId: req.user!.sub,
          body: String(body.body ?? ''),
          parentId: body.parentId ? String(body.parentId) : undefined,
        }),
      });
    } catch (e) {
      next(e);
    }
  },
);

boardAppRouter.post('/vote', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const body = req.body ?? {};
    const raw = Number(body.value ?? 0);
    const value = raw === 1 || raw === -1 ? raw : 0;
    res.json({
      ok: true,
      data: await vote({
        userId: req.user!.sub,
        targetType: body.targetType === 'REPLY' ? 'REPLY' : 'THREAD',
        targetId: String(body.targetId ?? ''),
        value,
      }),
    });
  } catch (e) {
    next(e);
  }
});

boardAdminRouter.use(requireAdmin);

boardAdminRouter.get('/threads', async (req, res, next) => {
  try {
    res.json({
      ok: true,
      data: await listThreads({
        categoryId: typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined,
        limit: 100,
      }),
    });
  } catch (e) {
    next(e);
  }
});

boardAdminRouter.post('/threads/:id/pin', async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    res.json({ ok: true, data: await pinThread(String(id), Boolean(req.body?.pinned ?? true)) });
  } catch (e) {
    next(e);
  }
});

boardAdminRouter.post('/threads/:id/hide', async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    res.json({ ok: true, data: await hideThread(String(id)) });
  } catch (e) {
    next(e);
  }
});
