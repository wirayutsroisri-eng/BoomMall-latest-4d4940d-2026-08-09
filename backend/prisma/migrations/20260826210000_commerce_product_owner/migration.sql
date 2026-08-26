-- Every private inventory product has one canonical account owner.
ALTER TABLE "CommerceProduct" ADD COLUMN "ownerUserId" TEXT;

-- Safe compatibility backfill for any rows created before this constraint.
UPDATE "CommerceProduct" AS product
SET "ownerUserId" = profile."userId"
FROM "UserProfile" AS profile
WHERE product."merchantId" = profile."shopId";

ALTER TABLE "CommerceProduct" ALTER COLUMN "ownerUserId" SET NOT NULL;

CREATE INDEX "CommerceProduct_ownerUserId_status_idx"
ON "CommerceProduct"("ownerUserId", "status");

ALTER TABLE "CommerceProduct"
ADD CONSTRAINT "CommerceProduct_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "UserProfile"("userId")
ON DELETE CASCADE ON UPDATE CASCADE;
