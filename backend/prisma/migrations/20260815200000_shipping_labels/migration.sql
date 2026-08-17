-- Auto-merge same-address shipping labels (4x6 thermal)

ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "shippingJson" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "addressMergeKey" TEXT;
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "shipmentGroupId" TEXT;

CREATE INDEX IF NOT EXISTS "CommerceOrder_merchantId_addressMergeKey_status_idx"
  ON "CommerceOrder"("merchantId", "addressMergeKey", "status");
CREATE INDEX IF NOT EXISTS "CommerceOrder_shipmentGroupId_idx"
  ON "CommerceOrder"("shipmentGroupId");

CREATE TABLE IF NOT EXISTS "shipment_groups" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "addressMergeKey" TEXT NOT NULL,
  "trackingNumber" TEXT NOT NULL,
  "shippingCarrier" TEXT NOT NULL DEFAULT 'Kerry',
  "orderIdsJson" JSONB NOT NULL DEFAULT '[]',
  "paymentKind" TEXT NOT NULL DEFAULT 'PAID',
  "codAmountThb" INTEGER NOT NULL DEFAULT 0,
  "printedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "shipment_groups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "shipment_groups_merchantId_createdAt_idx"
  ON "shipment_groups"("merchantId", "createdAt");
CREATE INDEX IF NOT EXISTS "shipment_groups_addressMergeKey_idx"
  ON "shipment_groups"("addressMergeKey");
CREATE UNIQUE INDEX IF NOT EXISTS "shipment_groups_merchantId_trackingNumber_key"
  ON "shipment_groups"("merchantId", "trackingNumber");
