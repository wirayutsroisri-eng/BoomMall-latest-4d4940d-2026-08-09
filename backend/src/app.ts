import './utils/bigint';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { loadEnv } from './config/env';
import { getPrismaPoolInfo } from './lib/prisma';
import { adminRouter } from './routes/admin';
import { moderationAdminRouter, moderationPublicRouter } from './routes/moderation';
import { chatAdminRouter, chatIngestRouter } from './routes/chatAdmin';
import { trustSafetyRouter } from './routes/trustSafety';
import { feedPersonalizationRouter } from './routes/feedPersonalization';
import { recommendationAdminRouter, recommendationAppRouter } from './modules/recommendation/http/routes';
import { chatAppRouter, chatDomainRouter } from './modules/chat/http/routes';
import { authDomainRouter } from './modules/auth/http/routes';
import { ecommerceDomainRouter } from './modules/ecommerce/http/routes';
import {
  adminPromotionRouter,
  sellerPromotionRouter,
} from './modules/ecommerce/http/promotionRoutes';
import { feedAppRouter, feedDomainRouter } from './modules/feed/http/routes';
import { commerceAppRouter, commerceAdminRouter } from './modules/ecommerce/http/commerceRoutes';
import { financeSellerRouter, financeAdminRouter, financeWebhookRouter, sellerReportsRouter } from './modules/finance';
import { boardAppRouter, boardAdminRouter } from './modules/board/http/routes';
import { notifyAppRouter } from './modules/notify/http/routes';
import { getPlatformDomainStatus } from './modules';
import { errorHandler } from './middleware/errorHandler';
import { chatMediaDir } from './modules/chat/http/media.controller';
import { legalPublicRouter } from './modules/legal/routes';
import { mediaAssetRouter } from './modules/media/http/routes';
import { ensureLocalMediaUploadDirectories, localMediaUploadDir } from './modules/media/storage/LocalMediaStorageProvider';
import { configuredMediaStorageKind } from './modules/media/storage';
import { storyRouter } from './modules/story/http/routes';
import { friendRouter } from './modules/friends/http/routes';

export function createApp() {
  const env = loadEnv();
  const app = express();

  app.use(helmet({
    // Socket.io / admin SPA on sibling ports
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  app.use(
    cors({
      origin: env.corsOrigin.length > 0 ? env.corsOrigin : true,
      exposedHeaders: ['Idempotency-Key'],
    }),
  );
  app.use(express.json({ limit: '200mb' }));
  app.use(express.urlencoded({ extended: true, limit: '200mb' }));
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  app.use('/media/chat', express.static(chatMediaDir(), { maxAge: '7d', fallthrough: false }));
  if (configuredMediaStorageKind() === 'local') {
    ensureLocalMediaUploadDirectories();
    app.use('/uploads', express.static(localMediaUploadDir(), {
      fallthrough: false,
      immutable: true,
      maxAge: process.env.NODE_ENV === 'production' ? '1y' : '1h',
      dotfiles: 'deny',
      index: false,
    }));
  }
  app.use('/legal', legalPublicRouter);

  app.get('/health', async (_req, res) => {
    res.json({
      ok: true,
      service: 'boommall-api',
      modules: [
        'auth-profile',
        'ecommerce-merchant',
        'marketplace-ads',
        'chat-realtime',
        'content-feed',
        'webboard',
        'push-notify',
        'commerce-core',
        'shipping-labels',
        'finance-settlement',
        'analytics',
      ],
      ts: new Date().toISOString(),
      dbPool: getPrismaPoolInfo(),
      redisConfigured: Boolean(process.env.REDIS_URL?.trim()),
    });
  });

  app.get('/api/v1/platform/domains', async (_req, res, next) => {
    try {
      res.json({ ok: true, data: await getPlatformDomainStatus() });
    } catch (e) {
      next(e);
    }
  });

  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/admin/moderation', moderationAdminRouter);
  // Alias paths from product spec
  app.use('/api/v1/admin', moderationAdminRouter);
  app.use('/api/v1/admin/chat', chatAdminRouter);
  app.use('/api/v1/admin/safety', trustSafetyRouter);
  app.use('/api/v1/admin/feed-config', feedPersonalizationRouter);
  app.use('/api/v1/admin/feed', feedPersonalizationRouter);
  app.use('/api/v1/admin/recommendation-config', recommendationAdminRouter);
  app.use('/api/v1', recommendationAppRouter);

  /** Domain services */
  app.use('/api/v1/auth', authDomainRouter);
  app.use('/api/v1/admin/ecommerce', ecommerceDomainRouter);
  app.use('/api/promotions', sellerPromotionRouter);
  app.use('/api/v1/promotions', sellerPromotionRouter);
  app.use('/api/admin/promotions', adminPromotionRouter);
  app.use('/api/v1/admin/promotions', adminPromotionRouter);
  app.use('/api/v1/admin/chat-domain', chatDomainRouter);
  app.use('/api/v1/chat-domain', chatAppRouter);
  app.use('/api/v1/feed', feedAppRouter);
  app.use('/api/v1/media-assets', mediaAssetRouter);
  app.use('/api/v1/stories', storyRouter);
  app.use('/api/v1/friends', friendRouter);
  app.use('/api/v1/admin/feed-domain', feedDomainRouter);
  app.use('/api/v1/board', boardAppRouter);
  app.use('/api/v1/admin/board', boardAdminRouter);
  app.use('/api/v1/notify', notifyAppRouter);

  app.use('/api/v1/commerce', commerceAppRouter);
  app.use('/api/v1/admin/commerce', commerceAdminRouter);
  app.use('/api/v1/finance/seller', financeSellerRouter);
  app.use('/api/v1/finance/admin', financeAdminRouter);
  app.use('/api/v1/finance/webhooks', financeWebhookRouter);
  app.use('/api/v1/seller/reports', sellerReportsRouter);

  app.use('/api/v1/chat', chatIngestRouter);
  app.use('/api/v1/moderation', moderationPublicRouter);
  app.use(errorHandler);
  return app;
}
