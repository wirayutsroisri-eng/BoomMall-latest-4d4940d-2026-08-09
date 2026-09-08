-- Supports the new public shop browse query (WHERE "shopId" IS NOT NULL
-- ORDER BY "createdAt" DESC, keyset-paginated).

CREATE INDEX IF NOT EXISTS "UserProfile_shopId_createdAt_idx" ON "UserProfile"("shopId", "createdAt");
