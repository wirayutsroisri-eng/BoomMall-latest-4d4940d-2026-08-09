-- Supports the new public shop browse query (WHERE "shopId" IS NOT NULL
-- ORDER BY "createdAt" DESC, keyset-paginated).
--
-- Plain CREATE INDEX, not CONCURRENTLY — see the detailed comment in
-- 20260908120050_product_public_slug_indexes/migration.sql: this repo's
-- production start command runs `prisma migrate deploy` unattended, and
-- CONCURRENTLY cannot run inside the transaction Prisma always wraps
-- migrations in (verified against this schema/Prisma version).

CREATE INDEX IF NOT EXISTS "UserProfile_shopId_createdAt_idx" ON "UserProfile"("shopId", "createdAt");
