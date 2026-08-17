-- Core Auth identities, Marketplace catalog, Ads + billing, Social posts

CREATE TABLE IF NOT EXISTS "AuthIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuthIdentity_provider_providerUserId_key"
  ON "AuthIdentity"("provider", "providerUserId");
CREATE INDEX IF NOT EXISTS "AuthIdentity_userId_idx" ON "AuthIdentity"("userId");

DO $$ BEGIN
  CREATE TYPE "CatalogKind" AS ENUM ('PRODUCT', 'SERVICE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CatalogItem" (
    "id" TEXT NOT NULL,
    "kind" "CatalogKind" NOT NULL,
    "merchantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceThb" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CatalogItem_kind_status_idx" ON "CatalogItem"("kind", "status");
CREATE INDEX IF NOT EXISTS "CatalogItem_merchantId_idx" ON "CatalogItem"("merchantId");
CREATE INDEX IF NOT EXISTS "CatalogItem_updatedAt_idx" ON "CatalogItem"("updatedAt");

DO $$ BEGIN
  CREATE TYPE "AdPlacementType" AS ENUM ('BANNER', 'SPONSORED_FEED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AdCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AdInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AdCampaign" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "placement" "AdPlacementType" NOT NULL,
    "status" "AdCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "budgetThb" BIGINT NOT NULL DEFAULT 0,
    "spentThb" BIGINT NOT NULL DEFAULT 0,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "targetingJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdCampaign_advertiserId_status_idx" ON "AdCampaign"("advertiserId", "status");
CREATE INDEX IF NOT EXISTS "AdCampaign_placement_status_idx" ON "AdCampaign"("placement", "status");

CREATE TABLE IF NOT EXISTS "AdCreative" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "imageUrl" TEXT,
    "ctaUrl" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdCreative_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdCreative_campaignId_active_idx" ON "AdCreative"("campaignId", "active");

CREATE TABLE IF NOT EXISTS "AdInvoice" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "amountThb" BIGINT NOT NULL,
    "status" "AdInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "pspRef" TEXT,
    "lineItemsJson" JSONB NOT NULL DEFAULT '[]',
    "auditJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdInvoice_invoiceNumber_key" ON "AdInvoice"("invoiceNumber");
CREATE INDEX IF NOT EXISTS "AdInvoice_status_createdAt_idx" ON "AdInvoice"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "AdInvoice_campaignId_idx" ON "AdInvoice"("campaignId");

CREATE TABLE IF NOT EXISTS "SocialPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mediaJson" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SocialPost_createdAt_idx" ON "SocialPost"("createdAt");
CREATE INDEX IF NOT EXISTS "SocialPost_authorId_createdAt_idx" ON "SocialPost"("authorId", "createdAt");
CREATE INDEX IF NOT EXISTS "SocialPost_status_createdAt_idx" ON "SocialPost"("status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "AdCreative" ADD CONSTRAINT "AdCreative_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AdInvoice" ADD CONSTRAINT "AdInvoice_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
