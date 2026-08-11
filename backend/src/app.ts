import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { loadEnv } from './config/env';
import { getPrismaPoolInfo } from './lib/prisma';
import { adminRouter } from './routes/admin';
import { ledgerRouter } from './routes/ledger';
import { moderationAdminRouter, moderationPublicRouter } from './routes/moderation';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const env = loadEnv();
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigin.length > 0 ? env.corsOrigin : true,
      exposedHeaders: ['Idempotency-Key'],
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'boommall-boom-coin-api',
      ts: new Date().toISOString(),
      dbPool: getPrismaPoolInfo(),
    });
  });

  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/admin/moderation', moderationAdminRouter);
  // Alias paths from product spec
  app.use('/api/v1/admin', moderationAdminRouter);
  app.use('/api/v1/moderation', moderationPublicRouter);
  app.use('/api/v1/ledger', ledgerRouter);

  app.use(errorHandler);
  return app;
}
