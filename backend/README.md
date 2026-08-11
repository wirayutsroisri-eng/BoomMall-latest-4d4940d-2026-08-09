# BoomMall · Boom Coin Backend

Node.js (Express) + TypeScript + Prisma (**PostgreSQL**)  
Closed-loop Boom Coin ledger with **double-entry** accounting.  
Designed for **private / on-premise company servers**.

Wallet balances are projections only — **no API edits balances directly**.

## On-premise quick start

```bash
cd backend
cp .env.example .env          # set passwords + private IP / CORS
./scripts/generate-db-certs.sh

# PostgreSQL (+ optional loopback port + PgAdmin)
docker compose up -d --build
docker compose --profile host-tools up -d

npm ci
npm run prisma:deploy
npm run db:seed
npm run dev                   # or: npm run start:prod
```

| Service | Default exposure |
|---------|------------------|
| PostgreSQL | **Docker internal only** (`boom_internal`) |
| DB loopback proxy | `127.0.0.1:5432` (profile `host-tools`) |
| PgAdmin | `127.0.0.1:5050` (profile `host-tools`) |
| API | `:4000` (host or profile `api`) |

Full topology: [`deploy/ON_PREM.md`](./deploy/ON_PREM.md)

## Environment

See [`.env.example`](./.env.example) for:

- Private / LAN `DATABASE_HOST` (`postgres` inside Compose, `127.0.0.1` on host)
- Prisma pool: `DATABASE_POOL_SIZE`, `DATABASE_POOL_TIMEOUT`, `DATABASE_CONNECT_TIMEOUT`
- TLS: `DATABASE_SSL_MODE=require` + `DATABASE_SSL_ROOT_CERT`

## Backup

```bash
npm run db:backup
# cron: 30 2 * * * /opt/boommall/backend/scripts/backup.sh >> /var/log/boommall-pg-backup.log 2>&1
```

## Business rules

| Rule | Behavior |
|------|----------|
| Initial supply | Mint **100,000** Boom Coin into `PLATFORM_TREASURY` |
| Seller top-up | Approve mints **1 Coin per 1 THB** into Seller wallet |
| Supply identity | `User + Seller + Treasury + Pools === totalMinted` |
| Idempotency | `Idempotency-Key` on approve |

## API

- `GET /api/v1/admin/dashboard/stats`
- `GET /api/v1/admin/topup?status=PENDING`
- `POST /api/v1/admin/topup/approve`
- `GET /api/v1/ledger/reconcile`

Auth: `Authorization: Bearer <ADMIN_API_KEY>`
