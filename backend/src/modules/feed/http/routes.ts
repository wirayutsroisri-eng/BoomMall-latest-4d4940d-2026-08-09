/**
 * Public + admin feed domain routes (social posts).
 */

import { Router } from 'express';
import { requireAdmin, adminHasPermission } from '../../../middleware/adminAuth';
import type { AuthedRequest } from '../../../middleware/adminAuth';
import { requireUserOrDevHeader } from '../../../middleware/userAuth';
import { rateLimits } from '../../../middleware/rateLimit';
import type { UserAuthedRequest } from '../../../middleware/userAuth';
import { createSocialPost, listSocialPosts, socialFeedDomainExtras, toggleSocialPostLike, recordFeedSignal, bumpShareCount, updateSocialPost, deleteSocialPost, updateSecondhandListingStatus } from '../SocialPostService';
import { addComment, listComments, toggleCommentLike } from '../CommentService';
import { contentFeedDomainStatus } from '../ContentFeedService';
import {
  createDraft,
  ensureSeedVersion,
  killSwitch,
  listConfigAudit,
  listConfigVersions,
  listExperiments,
  listFlags,
  publishVersion,
  rollbackTo,
  setFlag,
  updateDraft,
  upsertExperiment,
  isFlagEnabled,
} from '../serving/FeedConfigVersionService';
import { ingestFeedEvents } from '../serving/FeedEventService';
import { detachProductFromPost, listPostProducts } from '../PostProductService';
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
    const mine = String(req.query.mine ?? '') === '1';
    const refresh = String(req.query.refresh ?? '') === '1';
    const excludeIds = String(req.query.excludeIds ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 80);
    let authorIds: string[] | undefined;
    if (mine) {
      if (!req.user?.sub) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      authorIds = [req.user.sub];
    }
    if (tab === 'following' && req.user?.sub) {
      const following = await listFollowing(req.user.sub);
      authorIds = following.map((f) => f.followingId);
      if (!authorIds.length) authorIds = ['__none__'];
    }
    const listOptions = {
      authorIds,
      nearby: tab === 'nearby' && lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng, radiusKm: Number.isFinite(radiusKm) ? radiusKm : 10 }
        : undefined,
      lane: tab === 'board' ? 'board' : undefined,
      viewerId: req.user?.sub,
      includeHidden: mine,
    };
    let data = await listSocialPosts(40, {
      ...listOptions,
      excludeIds: refresh && !mine ? excludeIds : undefined,
    });
    // A refresh asks for unseen records first. Small development datasets may
    // have no unseen rows, so fall back to the latest real records instead of
    // returning an empty feed or manufacturing content.
    if (refresh && !mine && excludeIds.length && !data.length) {
      data = await listSocialPosts(40, listOptions);
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      data,
    });
  } catch (e) {
    next(e);
  }
});

feedAppRouter.patch('/posts/:id/secondhand-status', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const id = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const updated = await updateSecondhandListingStatus(id, req.user!.sub, String(req.body?.status ?? '') as Parameters<typeof updateSecondhandListingStatus>[2]);
    if (!updated) throw new AppError('NOT_FOUND', 'listing not found or forbidden', 404);
    res.json({ ok: true, data: updated });
  } catch (error) { next(error); }
});

feedAppRouter.post('/posts', rateLimits.write, requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
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
        products: body.products,
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
  rateLimits.write,
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
    const kind = String(req.body?.kind ?? '') as Parameters<typeof recordFeedSignal>[0]['kind'];
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

/**
 * Feed Serving V2 — viewer signals (impression / watch / skip / engage).
 *
 * Always answers 202 so a client can clear its queue: while the `feed_events`
 * flag is off the batch is acknowledged and discarded rather than retried, and
 * an anonymous viewer is accepted without a token.
 */
feedAppRouter.post('/events', rateLimits.events, async (req: UserAuthedRequest, res, next) => {
  try {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token) {
      try {
        const { verifyAppJwt } = await import('../../auth/JwtService');
        req.user = await verifyAppJwt(token);
      } catch {
        /* anonymous signals are still useful */
      }
    }
    const sessionId = String(req.body?.feedSessionId ?? req.body?.sessionId ?? '').trim();
    if (!sessionId) throw new AppError('VALIDATION', 'feedSessionId required', 400);

    const enabled = await isFlagEnabled('feed_events', req.user?.sub ?? sessionId);
    if (!enabled) {
      res.status(202).json({ ok: true, enabled: false, accepted: 0, dropped: 0 });
      return;
    }

    const result = await ingestFeedEvents({
      sessionId,
      userId: req.user?.sub ?? null,
      events: req.body?.events,
    });
    res.status(202).json({ ok: true, enabled: true, ...result });
  } catch (e) {
    next(e);
  }
});

/** ปักตะกร้า — live price and stock for the products pinned to a post. */
feedAppRouter.get('/posts/:id/products', async (req, res, next) => {
  try {
    const id = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    res.json({ ok: true, data: await listPostProducts(id) });
  } catch (e) {
    next(e);
  }
});

feedAppRouter.delete(
  '/posts/:id/products/:productId',
  requireUserOrDevHeader,
  async (req: UserAuthedRequest, res, next) => {
    try {
      const id = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
      const productId = String(
        Array.isArray(req.params.productId) ? req.params.productId[0] : req.params.productId,
      );
      res.json({
        ok: true,
        data: await detachProductFromPost({ postId: id, productId, authorId: req.user!.sub }),
      });
    } catch (e) {
      next(e);
    }
  },
);

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

/**
 * Feed Serving V2 control plane. Read is open to any feed admin; every mutation
 * needs `feed:write` and lands in the admin audit log.
 */
function requireFeedWrite(req: AuthedRequest) {
  if (!adminHasPermission(req.adminRole, 'feed:write', req.adminDesk)) {
    throw new AppError('FORBIDDEN', 'Missing permission: feed:write', 403);
  }
  return req.adminActor ?? 'admin';
}

feedDomainRouter.get('/config/versions', async (_req: AuthedRequest, res, next) => {
  try {
    await ensureSeedVersion();
    res.json({ ok: true, data: await listConfigVersions() });
  } catch (e) { next(e); }
});

feedDomainRouter.post('/config/draft', async (req: AuthedRequest, res, next) => {
  try {
    const actor = requireFeedWrite(req);
    const body = req.body ?? {};
    const data = body.version
      ? await updateDraft({ actor, version: Number(body.version), note: body.note, ranking: body.ranking, composer: body.composer, ad: body.ad })
      : await createDraft({ actor, fromVersion: body.fromVersion ? Number(body.fromVersion) : undefined, note: body.note, ranking: body.ranking, composer: body.composer, ad: body.ad });
    res.json({ ok: true, data });
  } catch (e) { next(e); }
});

feedDomainRouter.post('/config/publish', async (req: AuthedRequest, res, next) => {
  try {
    const actor = requireFeedWrite(req);
    const version = Number(req.body?.version);
    if (!Number.isFinite(version)) throw new AppError('VALIDATION', 'version required', 400);
    res.json({ ok: true, data: await publishVersion({ actor, version }) });
  } catch (e) { next(e); }
});

feedDomainRouter.post('/config/rollback', async (req: AuthedRequest, res, next) => {
  try {
    const actor = requireFeedWrite(req);
    const version = Number(req.body?.toVersion ?? req.body?.version);
    if (!Number.isFinite(version)) throw new AppError('VALIDATION', 'toVersion required', 400);
    res.json({ ok: true, data: await rollbackTo({ actor, version }) });
  } catch (e) { next(e); }
});

feedDomainRouter.get('/config/audit', async (_req: AuthedRequest, res, next) => {
  try {
    res.json({ ok: true, data: await listConfigAudit() });
  } catch (e) { next(e); }
});

feedDomainRouter.get('/flags', async (_req: AuthedRequest, res, next) => {
  try {
    res.json({ ok: true, data: await listFlags() });
  } catch (e) { next(e); }
});

feedDomainRouter.post('/flags', async (req: AuthedRequest, res, next) => {
  try {
    const actor = requireFeedWrite(req);
    const key = String(req.body?.key ?? '').trim();
    if (!key) throw new AppError('VALIDATION', 'key required', 400);
    const data = await setFlag({
      actor,
      key,
      enabled: Boolean(req.body?.enabled),
      rolloutPct: req.body?.rolloutPct != null ? Number(req.body.rolloutPct) : undefined,
      payload: req.body?.payload,
    });
    res.json({ ok: true, data });
  } catch (e) { next(e); }
});

feedDomainRouter.post('/kill-switch', async (req: AuthedRequest, res, next) => {
  try {
    const actor = requireFeedWrite(req);
    const scope = String(req.body?.scope ?? '').trim();
    if (!scope) throw new AppError('VALIDATION', 'scope required', 400);
    res.json({ ok: true, data: await killSwitch({ actor, scope }) });
  } catch (e) { next(e); }
});

feedDomainRouter.get('/experiments', async (_req: AuthedRequest, res, next) => {
  try {
    res.json({ ok: true, data: await listExperiments() });
  } catch (e) { next(e); }
});

feedDomainRouter.post('/experiments', async (req: AuthedRequest, res, next) => {
  try {
    const actor = requireFeedWrite(req);
    const key = String(req.body?.key ?? '').trim();
    if (!key) throw new AppError('VALIDATION', 'key required', 400);
    const data = await upsertExperiment({
      actor,
      key,
      status: req.body?.status,
      salt: req.body?.salt,
      surface: req.body?.surface ?? null,
      variants: req.body?.variants,
      startAt: req.body?.startAt ?? null,
      endAt: req.body?.endAt ?? null,
    });
    res.json({ ok: true, data });
  } catch (e) { next(e); }
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
