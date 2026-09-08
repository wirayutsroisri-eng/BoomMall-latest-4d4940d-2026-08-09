-- Indexes for the new `slug` column and the public catalog browse endpoint's
-- status+sort queries.
--
-- NOT using CREATE INDEX CONCURRENTLY: this repo's production start command
-- (package.json start:prod -> src/cli/migrate-deploy.ts) runs plain
-- `prisma migrate deploy` unattended on every container start, and Prisma
-- (confirmed against this schema, v6.19.3) unconditionally wraps each
-- migration in a transaction on Postgres — CONCURRENTLY cannot run inside
-- one (verified: both `prisma migrate deploy` and `prisma db execute` fail
-- with "CREATE INDEX CONCURRENTLY cannot run inside a transaction block").
-- There is no manual step in this pipeline to run it outside Prisma, so a
-- CONCURRENTLY migration here would crash-loop every deploy.
--
-- Tradeoff: this briefly holds a SHARE lock on CommerceProduct / UserProfile
-- (blocks writes, not reads) for the duration of the index build. Acceptable
-- at current data volume. If/when the table is large enough that this
-- matters, the fix belongs in migrate-deploy.ts (run CONCURRENTLY migrations
-- through a raw, non-transactional connection + `prisma migrate resolve
-- --applied`), not in a workaround here.

CREATE UNIQUE INDEX IF NOT EXISTS "CommerceProduct_slug_key" ON "CommerceProduct"("slug");
CREATE INDEX IF NOT EXISTS "CommerceProduct_status_basePrice_idx" ON "CommerceProduct"("status", "basePrice");
CREATE INDEX IF NOT EXISTS "CommerceProduct_status_updatedAt_idx" ON "CommerceProduct"("status", "updatedAt");
