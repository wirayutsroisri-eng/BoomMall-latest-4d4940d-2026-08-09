# Boom Coin Backend & Admin

| Path | Role |
|------|------|
| [`backend/`](./backend/) | Express + Prisma + PostgreSQL ledger API |
| [`backend/docker-compose.yml`](./backend/docker-compose.yml) | On-prem Postgres + PgAdmin (internal Docker network) |
| [`backend/deploy/ON_PREM.md`](./backend/deploy/ON_PREM.md) | Private server deploy guide |
| [`backend/scripts/backup.sh`](./backend/scripts/backup.sh) | Daily DB backup to local disk |
| [`admin/`](./admin/) | React Admin Dashboard (`/admin/`, `/admin/handbook`) |

```bash
cd backend
cp .env.example .env
./scripts/generate-db-certs.sh
docker compose --profile host-tools up -d --build
npm ci && npm run prisma:deploy && npm run db:seed && npm run dev
```

Admin UI: `http://localhost:5173/admin/` · Handbook (ADMIN): `http://localhost:5173/admin/handbook`
