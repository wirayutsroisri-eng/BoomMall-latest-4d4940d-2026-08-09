CREATE TYPE "MediaAssetType" AS ENUM ('IMAGE', 'VIDEO');
CREATE TYPE "MediaAssetStatus" AS ENUM ('UPLOADING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED');

CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" "MediaAssetType" NOT NULL,
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'UPLOADING',
    "storageKey" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "playbackUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "mimeType" TEXT NOT NULL,
    "fileSize" BIGINT,
    "postId" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");
CREATE INDEX "MediaAsset_ownerId_status_createdAt_idx" ON "MediaAsset"("ownerId", "status", "createdAt");
CREATE INDEX "MediaAsset_postId_idx" ON "MediaAsset"("postId");
CREATE INDEX "MediaAsset_status_updatedAt_idx" ON "MediaAsset"("status", "updatedAt");

ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
