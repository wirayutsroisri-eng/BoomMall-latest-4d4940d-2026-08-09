-- Public SEO slug for CommerceProduct. Backward compatible: `slug` is
-- nullable, and every public read that accepts a slug also accepts the raw
-- `id` unchanged. Indexes for this column live in the following migration
-- (20260908120050_product_public_slug_indexes), kept separate only for
-- readability — see that file for why they're plain CREATE INDEX, not
-- CONCURRENTLY.

ALTER TABLE "CommerceProduct" ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- Backfill existing rows: slugify(title) + last 6 chars of the (already
-- unique) product id as a collision-proof suffix. Falls back to
-- "product-<suffix>" when the title has no Thai/latin/digit characters to
-- slugify. Thai script (ก-๙) is kept as-is — BoomMall's catalog is
-- predominantly Thai-titled, so stripping to ASCII-only would reduce almost
-- every real product slug to a meaningless "product-xxxxxx" and defeat the
-- point of an SEO slug. Mirrored in CommerceService.slugForNewProduct for
-- newly created products.
UPDATE "CommerceProduct"
SET "slug" = (
  CASE
    WHEN trim(both '-' from regexp_replace(lower(title), '[^ก-๙a-z0-9]+', '-', 'g')) = ''
      THEN 'product-' || right(id, 6)
    ELSE trim(both '-' from regexp_replace(lower(title), '[^ก-๙a-z0-9]+', '-', 'g')) || '-' || right(id, 6)
  END
)
WHERE "slug" IS NULL;
