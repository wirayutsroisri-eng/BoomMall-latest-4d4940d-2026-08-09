import express, { Router } from 'express';
import type { Response } from 'express';
import { requireAdmin } from '../../../middleware/adminAuth';
import type { AuthedRequest } from '../../../middleware/adminAuth';
import { requireAuth, authedUserId } from '../../../middleware/userAuth';
import type { UserAuthedRequest } from '../../../middleware/userAuth';
import { AppError } from '../../../lib/errors';
import type { SocketGateway } from '../../../realtime/socket.gateway';
import {
  ensureShopConversation,
  ensureDirectConversation,
  ensureGroupConversation,
  flushCachedMessages,
  getChatRuntimeStatus,
  listMessages,
  listShopConversations,
  listAllConversations,
  markConversationDelivered,
} from '../services/ChatService';
import { listChatCatalog, sendWarehouseProductCard } from '../services/ChatCatalogService';
import { chatController } from './chat.controller';
import { uploadChatMedia } from './media.controller';
import { fanoutToConversation } from '../realtime/socketServer';
import {
  chatSocialDomainStatus,
  getSocialPolicy,
  reportChatMessage,
  saveSocialPolicy,
} from '../policies/SocialControlPolicy';

/**
 * Chat domain HTTP API (shop inbox + ops)
 * Mounted at /api/v1/chat-domain and /api/v1/admin/chat-domain
 */
export const chatDomainRouter = Router();

/** App ingest — JWT required. `/runtime` stays public for storage/status probes. */
export const chatAppRouter = Router();

chatAppRouter.get('/runtime', async (_req, res) => {
  const policy = await getSocialPolicy();
  res.json({
    ok: true,
    data: {
      ...(await getChatRuntimeStatus()),
      social: chatSocialDomainStatus(policy),
    },
  });
});

chatAppRouter.use(createChatRoutes());

/**
 * JWT-only chat routes. SocketGateway is optional: persist already fans out via getSocketGateway().
 */
export function createChatRoutes(_socketGateway?: SocketGateway) {
  const router = Router();
  const controller = chatController;

  router.use(requireAuth);

  router.get('/inbox', controller.getInbox);
  router.get('/conversations', controller.getInbox);
  router.post('/conversations', controller.createOrGetConversation);

  router.post('/media/presign-url', controller.getMediaUploadUrl);
  router.post('/media/presign', controller.getMediaUploadUrl);
  router.post('/media', express.raw({ type: '*/*', limit: '12mb' }), uploadChatMedia);

  router.post('/shop/conversations', async (req: UserAuthedRequest, res, next) => {
    try {
      const body = req.body ?? {};
      const data = await ensureShopConversation({
        shopId: String(body.shopId ?? ''),
        shopName: body.shopName ? String(body.shopName) : undefined,
        buyerId: authedUserId(req),
        sellerId: String(body.sellerId ?? ''),
      });
      res.status(201).json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  });

  router.get('/shop/conversations', async (req: UserAuthedRequest, res, next) => {
    try {
      const data = await listShopConversations({
        shopId: typeof req.query.shopId === 'string' ? req.query.shopId : undefined,
        userId: authedUserId(req),
      });
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  });

  router.post('/direct', async (req: UserAuthedRequest, res, next) => {
    try {
      const body = req.body ?? {};
      res.status(201).json({
        ok: true,
        data: await ensureDirectConversation({
          userId: authedUserId(req),
          peerUserId: String(body.peerUserId ?? ''),
          title: body.title ? String(body.title) : undefined,
        }),
      });
    } catch (e) {
      next(e);
    }
  });

  router.post('/groups', async (req: UserAuthedRequest, res, next) => {
    try {
      const body = req.body ?? {};
      const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
      res.status(201).json({
        ok: true,
        data: await ensureGroupConversation({
          creatorId: authedUserId(req),
          memberIds,
          title: body.title ? String(body.title) : undefined,
        }),
      });
    } catch (e) {
      next(e);
    }
  });

  router.post('/conversations/:conversationId/read', controller.markAsRead);
  router.post('/conversations/:id/read', controller.markAsRead);

  router.post('/conversations/:conversationId/delivered', markDelivered);
  router.post('/conversations/:id/delivered', markDelivered);

  router.get('/catalog', async (req, res, next) => {
    try {
      const shopId = String(req.query.shopId ?? '');
      res.json({ ok: true, data: await listChatCatalog(shopId) });
    } catch (e) {
      next(e);
    }
  });

  router.post('/conversations/:conversationId/product-card', controller.sendProductCard);
  router.post('/conversations/:id/product-cards', controller.sendProductCard);

  router.get('/conversations/:conversationId/messages', controller.listMessages);
  router.get('/conversations/:id/messages', controller.listMessages);
  router.get('/conversations/:conversationId/sync', controller.syncMessages);
  router.get('/conversations/:id/sync', controller.syncMessages);
  router.get('/conversations/:conversationId/history', controller.getHistory);
  router.get('/conversations/:id/history', controller.getHistory);
  router.post('/conversations/:conversationId/messages', controller.sendMessage);
  router.post('/conversations/:id/messages', controller.sendMessage);

  router.post('/reports', (req: UserAuthedRequest, res, next) => {
    try {
      const body = req.body ?? {};
      const data = reportChatMessage({
        messageId: String(body.messageId ?? ''),
        reason: String(body.reason ?? 'abuse'),
        details: body.details ? String(body.details) : undefined,
        reporterRef: authedUserId(req),
      });
      res.status(201).json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

async function markDelivered(req: UserAuthedRequest, res: Response, next: express.NextFunction) {
  try {
    const raw = req.params.conversationId ?? req.params.id;
    const id = Array.isArray(raw) ? raw[0] : raw;
    const userId = authedUserId(req);
    const data = await markConversationDelivered(String(id), userId);
    void fanoutToConversation(String(id), 'chat:delivered', {
      conversationId: id,
      userId,
      lastDeliveredAt: data.lastDeliveredAt,
    });
    res.json({ ok: true, data });
  } catch (e) {
    next(e);
  }
}

/** Admin: shop chat ops + flush */
chatDomainRouter.use(requireAdmin);

chatDomainRouter.get('/runtime', async (_req: AuthedRequest, res: Response) => {
  const policy = await getSocialPolicy();
  res.json({
    ok: true,
    data: {
      ...(await getChatRuntimeStatus()),
      social: chatSocialDomainStatus(policy),
    },
  });
});

chatDomainRouter.get('/social-policy', async (_req: AuthedRequest, res: Response) => {
  res.json({ ok: true, data: await getSocialPolicy() });
});

chatDomainRouter.put('/social-policy', async (req: AuthedRequest, res: Response) => {
  const body = req.body ?? {};
  res.json({
    ok: true,
    data: await saveSocialPolicy({ ...body, actor: req.adminActor ?? 'admin' }),
  });
});

chatDomainRouter.get('/conversations', async (req: AuthedRequest, res: Response) => {
  const typeRaw = typeof req.query.type === 'string' ? req.query.type.toUpperCase() : '';
  const type =
    typeRaw === 'DIRECT' || typeRaw === 'SHOP' || typeRaw === 'GROUP' ? typeRaw : undefined;
  const data = await listAllConversations({
    type,
    userId: typeof req.query.userId === 'string' ? req.query.userId : undefined,
  });
  res.json({ ok: true, data });
});

chatDomainRouter.post('/direct', async (req: AuthedRequest, res: Response) => {
  const body = req.body ?? {};
  const data = await ensureDirectConversation({
    userId: String(body.userId ?? ''),
    peerUserId: String(body.peerUserId ?? ''),
    title: body.title ? String(body.title) : undefined,
  });
  res.status(201).json({ ok: true, data });
});

chatDomainRouter.post('/groups', async (req: AuthedRequest, res: Response) => {
  const body = req.body ?? {};
  const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
  const data = await ensureGroupConversation({
    creatorId: String(body.creatorId ?? ''),
    memberIds,
    title: body.title ? String(body.title) : undefined,
  });
  res.status(201).json({ ok: true, data });
});

chatDomainRouter.get('/shop/conversations', async (req: AuthedRequest, res: Response) => {
  const data = await listShopConversations({
    shopId: typeof req.query.shopId === 'string' ? req.query.shopId : undefined,
    userId: typeof req.query.userId === 'string' ? req.query.userId : undefined,
  });
  res.json({ ok: true, data });
});

chatDomainRouter.post('/shop/conversations', async (req: AuthedRequest, res: Response) => {
  const body = req.body ?? {};
  const data = await ensureShopConversation({
    shopId: String(body.shopId ?? ''),
    shopName: body.shopName ? String(body.shopName) : undefined,
    buyerId: String(body.buyerId ?? ''),
    sellerId: String(body.sellerId ?? ''),
  });
  res.status(201).json({ ok: true, data });
});

chatDomainRouter.get('/catalog', async (req: AuthedRequest, res: Response) => {
  const shopId = String(req.query.shopId ?? '');
  res.json({ ok: true, data: await listChatCatalog(shopId) });
});

chatDomainRouter.post('/conversations/:id/product-cards', async (req: AuthedRequest, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = req.body ?? {};
  const msg = await sendWarehouseProductCard({
    conversationId: String(id),
    senderId: String(body.senderId ?? ''),
    productId: body.productId ? String(body.productId) : undefined,
    variantId: body.variantId ? String(body.variantId) : undefined,
    sku: body.sku ? String(body.sku) : undefined,
    clientMsgId: body.clientMsgId ? String(body.clientMsgId) : undefined,
    fallback: body.product,
  });
  void fanoutToConversation(String(id), 'chat:message', msg);
  res.status(201).json({ ok: true, data: msg });
});

chatDomainRouter.get('/conversations/:id/messages', async (req: AuthedRequest, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) throw new AppError('VALIDATION', 'id required', 400);
  res.json({ ok: true, data: await listMessages(String(id), 100) });
});

chatDomainRouter.post('/flush', async (_req: AuthedRequest, res: Response) => {
  res.json({ ok: true, data: await flushCachedMessages(200) });
});
