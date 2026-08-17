-- Product promotions (warehouse boost) + seller inbox + catalog isPromoted

ALTER TABLE "CatalogItem" ADD COLUMN IF NOT EXISTS "isPromoted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "CatalogItem_isPromoted_idx" ON "CatalogItem"("isPromoted");

CREATE TABLE IF NOT EXISTS "ProductPromotion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopName" TEXT,
    "productTitle" TEXT NOT NULL,
    "productImageUrl" TEXT,
    "productMediaType" TEXT,
    "packageType" TEXT NOT NULL,
    "priceThb" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "adStatus" TEXT NOT NULL DEFAULT 'pending_review',
    "paymentProofUrl" TEXT,
    "transactionId" TEXT,
    "rejectReason" TEXT,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductPromotion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductPromotion_adStatus_createdAt_idx"
  ON "ProductPromotion"("adStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "ProductPromotion_userId_adStatus_idx"
  ON "ProductPromotion"("userId", "adStatus");
CREATE INDEX IF NOT EXISTS "ProductPromotion_productId_adStatus_idx"
  ON "ProductPromotion"("productId", "adStatus");
CREATE INDEX IF NOT EXISTS "ProductPromotion_endDate_adStatus_idx"
  ON "ProductPromotion"("endDate", "adStatus");

CREATE TABLE IF NOT EXISTS "SellerNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SellerNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SellerNotification_userId_createdAt_idx"
  ON "SellerNotification"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SellerNotification_userId_read_idx"
  ON "SellerNotification"("userId", "read");
