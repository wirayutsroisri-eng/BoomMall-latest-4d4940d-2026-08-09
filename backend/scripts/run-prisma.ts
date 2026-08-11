/**
 * Run Prisma CLI with DATABASE_URL enriched for pool + TLS (on-prem).
 * Usage: npx tsx scripts/run-prisma.ts migrate deploy
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { buildDatabaseUrl } from '../src/config/env';

process.env.DATABASE_URL = buildDatabaseUrl();

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: tsx scripts/run-prisma.ts <prisma-args...>');
  process.exit(1);
}

const result = spawnSync('npx', ['prisma', ...args], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
