# BoomMall Backend

Node.js, Express, TypeScript, Prisma, and PostgreSQL backend for BoomMall social and physical-goods marketplace features.

## Local quick start

```bash
cd backend
cp .env.example .env
./scripts/generate-db-certs.sh
docker compose up -d --build
npm ci
npm run prisma:deploy
npm run dev
```

The database is internal-only by default. Optional host tools and the API container are documented in [`deploy/ON_PREM.md`](./deploy/ON_PREM.md).

See [`.env.example`](./.env.example) for PostgreSQL, TLS, object storage, authentication, Snowflake node ID, and payment-provider settings.

Main API areas include authentication, profiles, social content, moderation, shops, products, physical-goods orders, THB settlement, refunds, payouts, and admin operations.
