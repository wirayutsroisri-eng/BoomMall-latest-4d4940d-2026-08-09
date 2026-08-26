import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { buildDatabaseUrl } from '../src/config/env';

process.env.DATABASE_URL = buildDatabaseUrl();
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function main() {
  await prisma.$queryRaw`SELECT 1`;
  console.log('Seed complete: no demo financial data required.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
