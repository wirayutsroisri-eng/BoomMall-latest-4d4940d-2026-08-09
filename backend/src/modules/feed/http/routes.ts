/**
 * Public + admin feed domain routes (social posts).
 */

import { Router } from 'express';
import { requireAdmin, adminHasPermission } from '../../../middleware/adminAuth';
import type { AuthedRequest } from '../../../middleware/adminAuth';
import { requireUserOrDevHeader } from '../../../middleware/userAuth';
import type { UserAuthedRequest } from '../../../middleware/userAuth';
import { createSocialPost, listSocialPosts, socialFeedDomainExtras, toggleSocialPostLike, recordFeedSignal, bumpShareCount, updateSocialPost, deleteSocialPost } from '../SocialPostService';
import { addComment, listComments, toggleCommentLike } from '../CommentService';
import { contentFeedDomainStatus } from '../ContentFeedService';
import { listFollowing } from '../../auth/FollowService';
import { sendPushToUsers } from '../../notify/PushService';
import { listActiveInventory } from '../../ecommerce/AdInventoryService';
import { AppError } from '../../../lib/errors';

export const feedAppRouter = Router();
export const feedDomainRouter = Router();

feedAppRouter.get('/posts', async (req: UserAuthedRequest, res, next) => {
  try {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token) {
      try {
        const { verifyAppJwt } = await import('../../auth/JwtService');
        req.user = await verifyAppJwt(token);
      } catch {
        /* public list still allowed */
      }
    } else {
      const allowDev =
        process.env.ALLOW_DEV_AUTH === '1' || process.env.NODE_ENV !== 'production';
      const legacy = req.header('x-user-id')?.trim();
      if (allowDev && legacy) {
        req.user = { sub: legacy, id: legacy, role: 'BUYER' };
      }
    }
    const tab = String(req.query.tab ?? req.query.lane ?? '');
    const lat = req.query.lat != null ? Number(req.query.lat) : undefined;
    const lng = req.query.lng != null ? Number(req.query.lng) : undefined;
    const radiusKm = req.query.radiusKm != null ? Number(req.query.radiusKm) : 10;
    let authorIds: string[] | undefined;
    if (tab === 'following' && req.user?.sub) {
      const following = await listFollowing(req.user.sub);
      authorIds = following.map((f) => f.followingId);
      if (!authorIds.length) authorIds = ['__none__'];
    }
    res.json({
      ok: true,
      data: await listSocialPosts(40, {
        authorIds,
        nearby: tab === 'nearby' && lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
          ? { lat, lng, radiusKm: Number.isFinite(radiusKm) ? radiusKm : 10 }
          : undefined,
        lane: tab === 'board' ? 'board' : undefined,
        viewerId: req.user?.sub,
      }),
    });
  } catch (e) {
    next(e);
  }
});

feedAppRouter.post('/posts', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const body = req.body ?? {};
    res.status(201).json({
      ok: true,
      data: await createSocialPost({
        authorId: req.user!.sub,
        body: String(body.body ?? ''),
        media: body.media,
        lat: body.lat != null ? Number(body.lat) : undefined,
        lng: body.lng != null ? Number(body.lng) : undefined,
        locationLabel: body.locationLabel ? String(body.locationLabel) : undefined,
        tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
        linkUrl: body.linkUrl ? String(body.linkUrl) : undefined,
        lane: body.lane ? String(body.lane) : undefined,
      }),
    });
  } catch (e) {
    next(e);
  }
});

feedAppRouter.patch('/posts/:id', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = req.body ?? {};
    const updated = await updateSocialPost(String(id), req.user!.sub, {
      body: body.body != null ? String(body.body) : undefined,
      media: body.media,
      lat: body.lat != null ? Number(body.lat) : undefined,
      lng: body.lng != null ? Number(body.lng) : undefined,
      locationLabel: body.locationLabel != null ? String(body.locationLabel) : undefined,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
      linkUrl: body.linkUrl != null ? String(body.linkUrl) : null,
      lane: body.lane != null ? String(body.lane) : undefined,
    });
    if (!updated) throw new AppError('NOT_FOUND', 'post not found or forbidden', 404);
    res.json({ ok: true, data: updated });
  } catch (e) {
    next(e);
  }
});

feedAppRouter.delete('/posts/:id', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const ok = await deleteSocialPost(String(id), req.user!.sub);
    if (!ok) throw new AppError('NOT_FOUND', 'post not found or forbidden', 404);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

feedAppRouter.post('/posts/:id/like', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const liked = Boolean(req.body?.liked ?? true);
    const row = await toggleSocialPostLike(String(id), liked, req.user?.sub);
    await recordFeedSignal({
      kind: liked ? 'like' : 'unlike',
      contentId: String(id),
      userId: req.user?.sub,
    });
    res.json({ ok: true, data: row ?? { id, liked } });
  } catch (e) {
    next(e);
  }
});

feedAppRouter.get('/posts/:id/comments', async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    res.json({ ok: true, data: await listComments(String(id)) });
  } catch (e) {
    next(e);
  }
});

feedAppRouter.post(
  '/posts/:id/comments',
  requireUserOrDevHeader,
  async (req: UserAuthedRequest, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const body = req.body ?? {};
      const comment = await addComment({
        postId: String(id),
        authorId: req.user!.sub,
        body: String(body.body ?? body.text ?? ''),
        parentId: body.parentId ? String(body.parentId) : undefined,
      });
      void sendPushToUsers({
        userIds: body.notifyUserId ? [String(body.notifyUserId)] : [],
        title: 'ความคิดเห็นใหม่',
        body: comment.body.slice(0, 80),
        data: { postId: String(id), type: 'comment' },
      });
      res.status(201).json({ ok: true, data: comment });
    } catch (e) {
      next(e);
    }
  },
);

feedAppRouter.post(
  '/comments/:id/like',
  requireUserOrDevHeader,
  async (req: UserAuthedRequest, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      res.json({
        ok: true,
        data: await toggleCommentLike(String(id), Boolean(req.body?.liked ?? true)),
      });
    } catch (e) {
      next(e);
    }
  },
);

feedAppRouter.post('/signals', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const kind = String(req.body?.kind ?? '') as 'like' | 'unlike' | 'not_interested' | 'share';
    const contentId = String(req.body?.contentId ?? req.body?.content_id ?? '');
    if (kind === 'share' && contentId) await bumpShareCount(contentId);
    res.json({
      ok: true,
      data: await recordFeedSignal({ kind, contentId, userId: req.user?.sub }),
    });
  } catch (e) {
    next(e);
  }
});

feedAppRouter.get('/sponsored', async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await listActiveInventory('SPONSORED_FEED') });
  } catch (e) {
    next(e);
  }
});

feedAppRouter.get('/app-open', async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await listActiveInventory('APP_OPEN') });
  } catch (e) {
    next(e);
  }
});

feedAppRouter.get('/banners', async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await listActiveInventory('BANNER') });
  } catch (e) {
    next(e);
  }
});

feedDomainRouter.use(requireAdmin);

feedDomainRouter.get('/status', async (_req: AuthedRequest, res, next) => {
  try {
    res.json({
      ok: true,
      data: {
        ...(await contentFeedDomainStatus()),
        ...(await socialFeedDomainExtras()),
      },
    });
  } catch (e) {
    next(e);
  }
});

feedDomainRouter.get('/posts', async (req: AuthedRequest, res, next) => {
  try {
    const allowed =
      adminHasPermission(req.adminRole, 'feed:write', req.adminDesk) ||
      adminHasPermission(req.adminRole, 'users:moderate', req.adminDesk);
    if (!allowed) {
      next(new AppError('FORBIDDEN', 'Missing permission: feed:write', 403));
      return;
    }
    res.json({ ok: true, data: await listSocialPosts(100, { includeHidden: true }) });
  } catch (e) {
    next(e);
  }
});
