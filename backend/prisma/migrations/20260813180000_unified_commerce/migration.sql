-- Unified commerce + analytics

CREATE TABLE IF NOT EXISTS "CommerceProduct" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "masterSku" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'B2C',
    "basePrice" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isPromoted" BOOLEAN NOT NULL DEFAULT false,
    "payloadJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommerceProduct_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CommerceProduct_merchantId_status_idx" ON "CommerceProduct"("merchantId", "status");
CREATE INDEX IF NOT EXISTS "CommerceProduct_shopName_idx" ON "CommerceProduct"("shopName");
CREATE INDEX IF NOT EXISTS "CommerceProduct_updatedAt_idx" ON "CommerceProduct"("updatedAt");
CREATE INDEX IF NOT EXISTS "CommerceProduct_isPromoted_idx" ON "CommerceProduct"("isPromoted");

CREATE TABLE IF NOT EXISTS "CommerceSku" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "priceThb" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "payloadJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommerceSku_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CommerceSku_productId_idx" ON "CommerceSku"("productId");
CREATE INDEX IF NOT EXISTS "CommerceSku_sku_idx" ON "CommerceSku"("sku");

CREATE TABLE IF NOT EXISTS "CommerceStock" (
    "id" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommerceStock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CommerceStock_skuId_warehouseId_key" ON "CommerceStock"("skuId", "warehouseId");
CREATE INDEX IF NOT EXISTS "CommerceStock_warehouseId_idx" ON "CommerceStock"("warehouseId");

CREATE TABLE IF NOT EXISTS "CommerceOrder" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "merchandiseThb" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "linesJson" JSONB NOT NULL DEFAULT '[]',
    "pspRef" TEXT,
    "idempotencyKey" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommerceOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CommerceOrder_idempotencyKey_key" ON "CommerceOrder"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "CommerceOrder_buyerId_createdAt_idx" ON "CommerceOrder"("buyerId", "createdAt");
CREATE INDEX IF NOT EXISTS "CommerceOrder_status_createdAt_idx" ON "CommerceOrder"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "payloadJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AnalyticsEvent_name_createdAt_idx" ON "AnalyticsEvent"("name", "createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_userId_createdAt_idx" ON "AnalyticsEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_entityType_entityId_idx" ON "AnalyticsEvent"("entityType", "entityId");

ALTER TABLE "CommerceSku"
  ADD CONSTRAINT "CommerceSku_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "CommerceProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommerceStock"
  ADD CONSTRAINT "CommerceStock_skuId_fkey"
  FOREIGN KEY ("skuId") REFERENCES "CommerceSku"("id") ON DELETE CASCADE ON UPDATE CASCADE;
