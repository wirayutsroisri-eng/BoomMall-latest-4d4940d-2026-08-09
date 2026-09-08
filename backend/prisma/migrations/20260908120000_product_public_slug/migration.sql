-- Public SEO slug for CommerceProduct + indexes for the public catalog browse
-- endpoint (status + sort key). Backward compatible: `slug` is nullable, and
-- every public read that accepts a slug also accepts the raw `id` unchanged.

ALTER TABLE "CommerceProduct" ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- Backfill existing rows: slugify(title) + last 6 chars of the (already
-- unique) product id as a collision-proof suffix. Falls back to
-- "product-<suffix>" when the title has no latin/digit characters to slugify.
UPDATE "CommerceProduct"
SET "slug" = (
  CASE
    WHEN trim(both '-' from regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g')) = ''
      THEN 'product-' || right(id, 6)
    ELSE trim(both '-' from regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g')) || '-' || right(id, 6)
  END
)
WHERE "slug" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "CommerceProduct_slug_key" ON "CommerceProduct"("slug");
CREATE INDEX IF NOT EXISTS "CommerceProduct_status_basePrice_idx" ON "CommerceProduct"("status", "basePrice");
CREATE INDEX IF NOT EXISTS "CommerceProduct_status_updatedAt_idx" ON "CommerceProduct"("status", "updatedAt");
