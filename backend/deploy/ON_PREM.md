# On-Premise Deploy Guide (Private Company Server)

## Topology

```
[Admin laptop] --SSH tunnel--> [Company server]
                                  ├─ API :4000          (LAN / firewall)
                                  ├─ PgAdmin :5050      (127.0.0.1 only)
                                  └─ Docker network boom_internal
                                       └─ PostgreSQL     (no public port)
                                            TLS required
```

PostgreSQL listens only inside `boom_internal`.  
Host tooling uses profile `host-tools` → `127.0.0.1:5432` via socat (loopback only).

## First-time setup

```bash
cd backend
cp .env.example .env
# edit POSTGRES_PASSWORD, ADMIN_API_KEY, DATABASE_HOST, CORS_ORIGIN (private IP)

# Include company LAN IP in certificate SAN if API connects by IP
CERT_SAN_HOSTS=postgres,127.0.0.1,10.10.0.5 ./scripts/generate-db-certs.sh

docker compose up -d --build
docker compose --profile host-tools up -d

npm ci
npm run prisma:deploy
npm run db:seed
npm run start:prod
# or: docker compose --profile api --profile host-tools up -d --build
```

## Daily backup (cron)

```cron
30 2 * * * /opt/boommall/backend/scripts/backup.sh >> /var/log/boommall-pg-backup.log 2>&1
```

Backups land in `BACKUP_DIR` (default `./var/backups/postgres`) on local server disk.

## TLS notes

- Server certs: `deploy/certs/{ca.crt,server.crt,server.key}`
- API uses `DATABASE_SSL_MODE=require` + `DATABASE_SSL_ROOT_CERT`
- `pg_hba.conf` rejects non-SSL remote connections (`hostnossl … reject`)
