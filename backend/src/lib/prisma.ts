import { PrismaClient } from '@prisma/client';
import { loadEnv } from '../config/env';

const env = loadEnv();

/**
 * Single Prisma client with on-prem pool settings applied via DATABASE_URL
 * (connection_limit, pool_timeout, connect_timeout, sslmode, sslrootcert).
 */
export const prisma = new PrismaClient({
  datasources: {
    db: { url: env.databaseUrl },
  },
  log:
    process.env.PRISMA_LOG === '1'
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
});

export function getPrismaPoolInfo() {
  return {
    connectionLimit: env.prisma.connectionLimit,
    poolTimeoutSec: env.prisma.poolTimeoutSec,
    connectTimeoutSec: env.prisma.connectTimeoutSec,
    sslMode: env.prisma.sslMode,
  };
}
