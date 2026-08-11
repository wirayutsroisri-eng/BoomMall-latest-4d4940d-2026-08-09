import 'dotenv/config';
import { loadEnv } from './config/env';
import { createApp } from './app';
import { getPrismaPoolInfo, prisma } from './lib/prisma';
import { bootstrapSystem } from './services/bootstrap';

async function main() {
  const env = loadEnv();
  await bootstrapSystem(prisma, env.initialTreasuryMint);
  const app = createApp();
  const pool = getPrismaPoolInfo();

  app.listen(env.port, () => {
    console.log(`Boom Coin API listening on :${env.port}`);
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
