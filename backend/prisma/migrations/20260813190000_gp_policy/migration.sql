-- Admin-configurable GP policy + order GP split

CREATE TABLE IF NOT EXISTS "MarketplaceGpPolicy" (
    "id" TEXT NOT NULL DEFAULT 'GLOBAL_GP',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultGpBps" INTEGER NOT NULL DEFAULT 500,
    "b2cGpBps" INTEGER,
    "b2bGpBps" INTEGER,
    "minOrderThb" INTEGER NOT NULL DEFAULT 0,
    "merchantOverridesJson" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "MarketplaceGpPolicy_pkey" PRIMARY KEY ("id")
);

INSERT INTO "MarketplaceGpPolicy" ("id", "enabled", "defaultGpBps", "minOrderThb", "merchantOverridesJson", "updatedAt", "updatedBy")
VALUES ('GLOBAL_GP', true, 500, 0, '[]', CURRENT_TIMESTAMP, 'system')
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "merchantId" TEXT;
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "gpBps" INTEGER;
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "gpAmountThb" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "netToMerchantThb" INTEGER;

CREATE INDEX IF NOT EXISTS "CommerceOrder_merchantId_createdAt_idx" ON "CommerceOrder"("merchantId", "createdAt");
