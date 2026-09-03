-- Feed Serving V2 — foundation only.
-- Nothing here is read by the serving path yet: every table lands ahead of the
-- feature flags so P0·A can ship (and roll back) without touching live traffic.

-- ─── Share / mention lineage on existing posts ─────────────────────────────
ALTER TABLE "SocialPost" ADD COLUMN "sharedPostId" TEXT;
ALTER TABLE "SocialPost" ADD COLUMN "rootPostId" TEXT;
ALTER TABLE "SocialPost" ADD COLUMN "shareKind" TEXT;
ALTER TABLE "SocialPost" ADD COLUMN "repostCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SocialPost" ADD COLUMN "mentionCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "SocialPost_rootPostId_createdAt_idx" ON "SocialPost"("rootPostId", "createdAt");
CREATE INDEX "SocialPost_sharedPostId_idx" ON "SocialPost"("sharedPostId");

-- ─── Versioned algorithm config ────────────────────────────────────────────
CREATE TABLE "FeedConfigVersion" (
  "id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "note" TEXT,
  "rankingJson" JSONB NOT NULL DEFAULT '{}',
  "composerJson" JSONB NOT NULL DEFAULT '{}',
  "adJson" JSONB NOT NULL DEFAULT '{}',
  "parentVersion" INTEGER,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "publishedBy" TEXT,
  CONSTRAINT "FeedConfigVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeedConfigVersion_version_key" ON "FeedConfigVersion"("version");
CREATE INDEX "FeedConfigVersion_status_version_idx" ON "FeedConfigVersion"("status", "version");

CREATE TABLE "FeedExperiment" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "salt" TEXT NOT NULL,
  "variantsJson" JSONB NOT NULL DEFAULT '[]',
  "surface" TEXT,
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedExperiment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeedExperiment_key_key" ON "FeedExperiment"("key");
CREATE INDEX "FeedExperiment_status_idx" ON "FeedExperiment"("status");

CREATE TABLE "FeedFlag" (
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "rolloutPct" INTEGER NOT NULL DEFAULT 0,
  "payloadJson" JSONB NOT NULL DEFAULT '{}',
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedFlag_pkey" PRIMARY KEY ("key")
);

-- ─── Viewer signals + rollup ───────────────────────────────────────────────
CREATE TABLE "FeedEvent" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT,
  "itemId" TEXT NOT NULL,
  "rootId" TEXT,
  "itemKind" TEXT NOT NULL DEFAULT 'organic',
  "slot" INTEGER NOT NULL DEFAULT 0,
  "type" TEXT NOT NULL,
  "action" TEXT,
  "watchMs" INTEGER NOT NULL DEFAULT 0,
  "videoMs" INTEGER NOT NULL DEFAULT 0,
  "dwellMs" INTEGER NOT NULL DEFAULT 0,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "rankToken" TEXT,
  "configVersion" INTEGER,
  "variant" TEXT,
  "seq" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeedEvent_sessionId_itemId_type_seq_key"
  ON "FeedEvent"("sessionId", "itemId", "type", "seq");
CREATE INDEX "FeedEvent_itemId_createdAt_idx" ON "FeedEvent"("itemId", "createdAt");
CREATE INDEX "FeedEvent_rootId_createdAt_idx" ON "FeedEvent"("rootId", "createdAt");
CREATE INDEX "FeedEvent_createdAt_idx" ON "FeedEvent"("createdAt");

CREATE TABLE "PostMetricsRollup" (
  "postId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "watchMsSum" BIGINT NOT NULL DEFAULT 0,
  "completes" INTEGER NOT NULL DEFAULT 0,
  "skips" INTEGER NOT NULL DEFAULT 0,
  "likes" INTEGER NOT NULL DEFAULT 0,
  "comments" INTEGER NOT NULL DEFAULT 0,
  "shares" INTEGER NOT NULL DEFAULT 0,
  "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PostMetricsRollup_pkey" PRIMARY KEY ("postId", "day")
);
CREATE INDEX "PostMetricsRollup_day_idx" ON "PostMetricsRollup"("day");

-- ─── Ad delivery ledger ────────────────────────────────────────────────────
CREATE TABLE "AdDelivery" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "creativeId" TEXT NOT NULL,
  "userId" TEXT,
  "sessionId" TEXT NOT NULL,
  "slot" INTEGER NOT NULL DEFAULT 0,
  "servedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "impressedAt" TIMESTAMP(3),
  "clickedAt" TIMESTAMP(3),
  "costThb" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "AdDelivery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdDelivery_campaignId_servedAt_idx" ON "AdDelivery"("campaignId", "servedAt");
CREATE INDEX "AdDelivery_userId_servedAt_idx" ON "AdDelivery"("userId", "servedAt");

-- ─── Seen-set (durable mirror of Redis) ────────────────────────────────────
CREATE TABLE "FeedSeen" (
  "userId" TEXT NOT NULL,
  "surface" TEXT NOT NULL,
  "rootPostId" TEXT NOT NULL,
  "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedSeen_pkey" PRIMARY KEY ("userId", "surface", "rootPostId")
);
CREATE INDEX "FeedSeen_seenAt_idx" ON "FeedSeen"("seenAt");

-- ─── Mentions + outbound share links ───────────────────────────────────────
CREATE TABLE "PostMention" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL DEFAULT 'POST',
  "entityId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "byUserId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'BODY',
  "start" INTEGER,
  "len" INTEGER,
  "mediaId" TEXT,
  "x" DOUBLE PRECISION,
  "y" DOUBLE PRECISION,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostMention_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PostMention_entityType_entityId_idx" ON "PostMention"("entityType", "entityId");
CREATE INDEX "PostMention_userId_createdAt_idx" ON "PostMention"("userId", "createdAt");

CREATE TABLE "ShareLink" (
  "id" TEXT NOT NULL,
  "shortId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "ownerId" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'copy',
  "clickCount" INTEGER NOT NULL DEFAULT 0,
  "lastClickAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShareLink_shortId_key" ON "ShareLink"("shortId");
CREATE INDEX "ShareLink_postId_createdAt_idx" ON "ShareLink"("postId", "createdAt");
CREATE INDEX "ShareLink_ownerId_createdAt_idx" ON "ShareLink"("ownerId", "createdAt");

-- Existing posts are their own root: keeps dedupe correct from the first query.
UPDATE "SocialPost" SET "rootPostId" = "id" WHERE "rootPostId" IS NULL;
