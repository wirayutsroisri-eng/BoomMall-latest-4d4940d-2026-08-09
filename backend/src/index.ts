import 'dotenv/config';
import './utils/bigint';
import http from 'node:http';
import { loadEnv } from './config/env';
import { createApp } from './app';
import { getPrismaPoolInfo, prisma } from './lib/prisma';
import { bootstrapSystem } from './services/bootstrap';
import { attachChatRealtime } from './modules/chat/realtime/socketServer';
import { bootstrapPspFromEnv } from './modules/ecommerce/PspGateway';
import { bootstrapSellerPayoutFromEnv } from './modules/finance/services/PayoutGatewayService';
import { startPromotionExpiryJob } from './modules/ecommerce/ProductPromotionService';
import { startEscrowAutoCompleteJob } from './modules/finance';
import { ensureAppleReviewAccount, APPLE_REVIEW_EMAIL } from './modules/auth/appleReviewAccount';

async function main() {
  const env = loadEnv();
  bootstrapPspFromEnv();
  bootstrapSellerPayoutFromEnv();
  await bootstrapSystem(prisma, env.initialTreasuryMint);
  try {
    await ensureAppleReviewAccount();
    console.log(`Apple Review demo: ${APPLE_REVIEW_EMAIL}`);
  } catch (err) {
    console.warn('Apple Review account seed skipped:', err);
  }
  const app = createApp();
  const server = http.createServer(app);
  const chat = await attachChatRealtime(server);
  const pool = getPrismaPoolInfo();

  startPromotionExpiryJob(60_000);
  startEscrowAutoCompleteJob(60 * 60_000);

  server.listen(env.port, () => {
    console.log(`BoomMall API listening on :${env.port}`);
    console.log(`Domains: auth-profile | ecommerce-merchant | chat-realtime | content-feed`);
    console.log(`Chat Socket.io path: ${chat.path}`);
    console.log(
      `DB pool connection_limit=${pool.connectionLimit} pool_timeout=${pool.poolTimeoutSec}s sslmode=${pool.sslMode}`,
    );
    console.log(`Admin auth: Authorization: Bearer ***`);
  });
}

main().catch(async (err) => {
  console.error('Failed to start:', err);
  await prisma.$disconnect();
  process.exit(1);
});
