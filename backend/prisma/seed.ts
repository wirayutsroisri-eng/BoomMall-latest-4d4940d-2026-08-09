import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { buildDatabaseUrl } from '../src/config/env';
import { bootstrapSystem } from '../src/services/bootstrap';

process.env.DATABASE_URL = buildDatabaseUrl();
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function main() {
  const initial = BigInt(process.env.INITIAL_TREASURY_MINT ?? '100000');
  const result = await bootstrapSystem(prisma, initial);
  console.log('Seed complete:', {
    totalMinted: result.totalMinted.toString(),
    treasuryBalance: result.treasuryBalance.toString(),
    sellerDemoId: result.demoSellerWalletId,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
