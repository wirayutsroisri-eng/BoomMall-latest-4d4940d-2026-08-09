-- Shoppable posts ("ปักตะกร้า"): a post can pin real catalog products.
-- Price and stock stay in the commerce tables — a pin is a reference, not a copy.

ALTER TABLE "SocialPost" ADD COLUMN "productCount" INTEGER NOT NULL DEFAULT 0;

-- Attribution for the commission system that comes later. Nullable on purpose:
-- orders placed outside a post simply carry no source.
ALTER TABLE "CommerceOrder" ADD COLUMN "sourcePostId" TEXT;
ALTER TABLE "CommerceOrder" ADD COLUMN "sourceCreatorId" TEXT;

CREATE TABLE "PostProduct" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "skuId" TEXT,
  "sellerId" TEXT NOT NULL,
  "mediaId" TEXT,
  "x" DOUBLE PRECISION,
  "y" DOUBLE PRECISION,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PostProduct_postId_productId_key" ON "PostProduct"("postId", "productId");
CREATE INDEX "PostProduct_postId_sortOrder_idx" ON "PostProduct"("postId", "sortOrder");
CREATE INDEX "PostProduct_productId_createdAt_idx" ON "PostProduct"("productId", "createdAt");
CREATE INDEX "PostProduct_sellerId_createdAt_idx" ON "PostProduct"("sellerId", "createdAt");
