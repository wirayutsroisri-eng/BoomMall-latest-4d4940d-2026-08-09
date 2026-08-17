/**
 * On-premise environment + Prisma DATABASE_URL builder.
 * Prefer discrete DB_* vars on company servers; DATABASE_URL still supported.
 */

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v == null || v === '') {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

function optInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid integer env ${name}=${raw}`);
  }
  return Math.trunc(n);
}

export type AppEnv = {
  port: number;
  adminApiKey: string;
  corsOrigin: string[];
  initialTreasuryMint: bigint;
  databaseUrl: string;
  redisUrl: string | null;
  chatFlushIntervalMs: number;
  chatSocketPath: string;
  /** Tuned for private company servers */
  prisma: {
    connectionLimit: number;
    poolTimeoutSec: number;
    connectTimeoutSec: number;
    sslMode: string;
  };
};

/**
 * Build libpq URL with connection pool + TLS query params for Prisma.
 * @see https://www.prisma.io/docs/orm/overview/databases/postgresql#connection-url
 */
export function buildDatabaseUrl(): string {
  if (process.env.DATABASE_URL?.trim()) {
    return enrichDatabaseUrl(process.env.DATABASE_URL.trim());
  }

  const user = encodeURIComponent(required('DATABASE_USER', process.env.POSTGRES_USER ?? 'boom'));
  const pass = encodeURIComponent(
    required('DATABASE_PASSWORD', process.env.POSTGRES_PASSWORD),
  );
  const host = required('DATABASE_HOST', '127.0.0.1');
  const port = required('DATABASE_PORT', '5432');
  const db = required('DATABASE_NAME', process.env.POSTGRES_DB ?? 'boommall_coin');
  const schema = process.env.DATABASE_SCHEMA ?? 'public';

  const base = `postgresql://${user}:${pass}@${host}:${port}/${db}?schema=${encodeURIComponent(schema)}`;
  return enrichDatabaseUrl(base);
}

function enrichDatabaseUrl(url: string): string {
  const u = new URL(url);

  const connectionLimit = String(optInt('DATABASE_POOL_SIZE', optInt('PRISMA_CONNECTION_LIMIT', 10)));
  const poolTimeout = String(optInt('DATABASE_POOL_TIMEOUT', 20));
  const connectTimeout = String(optInt('DATABASE_CONNECT_TIMEOUT', 10));
  const sslMode = process.env.DATABASE_SSL_MODE ?? 'prefer';

  if (!u.searchParams.has('connection_limit')) {
    u.searchParams.set('connection_limit', connectionLimit);
  }
  if (!u.searchParams.has('pool_timeout')) {
    u.searchParams.set('pool_timeout', poolTimeout);
  }
  if (!u.searchParams.has('connect_timeout')) {
    u.searchParams.set('connect_timeout', connectTimeout);
  }
  if (!u.searchParams.has('sslmode')) {
    u.searchParams.set('sslmode', sslMode);
  }

  const rootCert = process.env.DATABASE_SSL_ROOT_CERT;
  if (rootCert && !u.searchParams.has('sslrootcert')) {
    u.searchParams.set('sslrootcert', rootCert);
  }
  const sslCert = process.env.DATABASE_SSL_CERT;
  if (sslCert && !u.searchParams.has('sslcert')) {
    u.searchParams.set('sslcert', sslCert);
  }
  const sslKey = process.env.DATABASE_SSL_KEY;
  if (sslKey && !u.searchParams.has('sslkey')) {
    u.searchParams.set('sslkey', sslKey);
  }

  return u.toString();
}

let cached: AppEnv | null = null;

export function loadEnv(): AppEnv {
  if (cached) return cached;

  const databaseUrl = buildDatabaseUrl();
  // Ensure Prisma / drivers see the enriched URL
  process.env.DATABASE_URL = databaseUrl;

  cached = {
    port: optInt('PORT', 4000),
    adminApiKey: required('ADMIN_API_KEY'),
    corsOrigin: (process.env.CORS_ORIGIN ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    initialTreasuryMint: BigInt(process.env.INITIAL_TREASURY_MINT ?? '100000'),
    databaseUrl,
    redisUrl: process.env.REDIS_URL?.trim() || null,
    chatFlushIntervalMs: optInt('CHAT_FLUSH_INTERVAL_MS', 2000),
    chatSocketPath: process.env.CHAT_SOCKET_PATH?.trim() || '/socket.io/chat',
    prisma: {
      connectionLimit: optInt('DATABASE_POOL_SIZE', optInt('PRISMA_CONNECTION_LIMIT', 10)),
      poolTimeoutSec: optInt('DATABASE_POOL_TIMEOUT', 20),
      connectTimeoutSec: optInt('DATABASE_CONNECT_TIMEOUT', 10),
      sslMode: process.env.DATABASE_SSL_MODE ?? 'prefer',
    },
  };
  return cached;
}
