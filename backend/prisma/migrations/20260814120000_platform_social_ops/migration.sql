-- Follow graph, nested comments, board forum, read receipts, push devices, shipping

ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "bio" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "coverUrl" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN IF NOT EXISTS "privacyJson" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS "UserProfile_handle_idx" ON "UserProfile"("handle");
CREATE INDEX IF NOT EXISTS "UserProfile_email_idx" ON "UserProfile"("email");

ALTER TABLE "ChatParticipant" ADD COLUMN IF NOT EXISTS "lastReadAt" TIMESTAMP(3);

ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "commentCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "shareCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION;
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION;
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "locationLabel" TEXT;
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "tagsJson" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "linkUrl" TEXT;
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "lane" TEXT NOT NULL DEFAULT 'foryou';

CREATE INDEX IF NOT EXISTS "SocialPost_lane_createdAt_idx" ON "SocialPost"("lane", "createdAt");

ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "trackingNumber" TEXT;
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "shippingCarrier" TEXT;
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "shippingStatus" TEXT;
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "shippedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "CommerceOrder_shippingStatus_idx" ON "CommerceOrder"("shippingStatus");

CREATE TABLE IF NOT EXISTS "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "followingHandle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Follow_followerId_followingId_key" ON "Follow"("followerId", "followingId");
CREATE INDEX IF NOT EXISTS "Follow_followerId_createdAt_idx" ON "Follow"("followerId", "createdAt");
CREATE INDEX IF NOT EXISTS "Follow_followingId_idx" ON "Follow"("followingId");
CREATE INDEX IF NOT EXISTS "Follow_followingHandle_idx" ON "Follow"("followingHandle");

CREATE TABLE IF NOT EXISTS "SocialLike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialLike_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SocialLike_userId_postId_key" ON "SocialLike"("userId", "postId");
CREATE INDEX IF NOT EXISTS "SocialLike_postId_idx" ON "SocialLike"("postId");

CREATE TABLE IF NOT EXISTS "SocialComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SocialComment_postId_createdAt_idx" ON "SocialComment"("postId", "createdAt");
CREATE INDEX IF NOT EXISTS "SocialComment_parentId_idx" ON "SocialComment"("parentId");

CREATE TABLE IF NOT EXISTS "BoardCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BoardCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BoardCategory_slug_key" ON "BoardCategory"("slug");

CREATE TABLE IF NOT EXISTS "BoardThread" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BoardThread_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BoardThread_categoryId_pinned_score_idx" ON "BoardThread"("categoryId", "pinned", "score");
CREATE INDEX IF NOT EXISTS "BoardThread_createdAt_idx" ON "BoardThread"("createdAt");
CREATE INDEX IF NOT EXISTS "BoardThread_status_createdAt_idx" ON "BoardThread"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "BoardReply" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BoardReply_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BoardReply_threadId_createdAt_idx" ON "BoardReply"("threadId", "createdAt");
CREATE INDEX IF NOT EXISTS "BoardReply_parentId_idx" ON "BoardReply"("parentId");

CREATE TABLE IF NOT EXISTS "BoardVote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BoardVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BoardVote_userId_targetType_targetId_key" ON "BoardVote"("userId", "targetType", "targetId");
CREATE INDEX IF NOT EXISTS "BoardVote_targetType_targetId_idx" ON "BoardVote"("targetType", "targetId");

CREATE TABLE IF NOT EXISTS "PushDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'ios',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PushDevice_token_key" ON "PushDevice"("token");
CREATE INDEX IF NOT EXISTS "PushDevice_userId_idx" ON "PushDevice"("userId");

DO $$ BEGIN
  ALTER TABLE "BoardThread" ADD CONSTRAINT "BoardThread_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "BoardCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BoardReply" ADD CONSTRAINT "BoardReply_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "BoardThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "BoardCategory" ("id", "slug", "title", "description", "sortOrder")
VALUES
  ('board-cat-general', 'general', 'ทั่วไป', 'พูดคุยเรื่องทั่วไปของชุมชน', 0),
  ('board-cat-trade', 'trade', 'ซื้อขาย', 'ประกาศซื้อ ขาย แลกเปลี่ยน', 1),
  ('board-cat-jobs', 'jobs', 'ช่าง / บริการ', 'หาช่าง รับงาน บริการในพื้นที่', 2),
  ('board-cat-qa', 'qa', 'คำถาม', 'ถาม-ตอบ เคล็ดลับ และช่วยเหลือ', 3)
ON CONFLICT ("slug") DO NOTHING;
