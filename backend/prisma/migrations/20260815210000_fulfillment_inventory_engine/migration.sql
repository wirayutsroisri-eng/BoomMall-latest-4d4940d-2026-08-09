-- AlterTable
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "courierEvent" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "commerce_stock_ledger" (
    "id" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "onHandAfter" INTEGER NOT NULL,
    "reservedAfter" INTEGER NOT NULL,
    "availableAfter" INTEGER NOT NULL,
    "orderId" TEXT,
    "reason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_stock_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "shipment_tracking_events" (
    "id" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "carrier" TEXT NOT NULL DEFAULT 'Kerry',
    "event" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payloadJson" JSONB NOT NULL DEFAULT '{}',
    "orderIdsJson" JSONB NOT NULL DEFAULT '[]',
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "commerce_stock_ledger_idempotencyKey_key" ON "commerce_stock_ledger"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "commerce_stock_ledger_skuId_createdAt_idx" ON "commerce_stock_ledger"("skuId", "createdAt");
CREATE INDEX IF NOT EXISTS "commerce_stock_ledger_orderId_idx" ON "commerce_stock_ledger"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "shipment_tracking_events_trackingNumber_event_occurredAt_key" ON "shipment_tracking_events"("trackingNumber", "event", "occurredAt");
CREATE INDEX IF NOT EXISTS "shipment_tracking_events_trackingNumber_createdAt_idx" ON "shipment_tracking_events"("trackingNumber", "createdAt");
