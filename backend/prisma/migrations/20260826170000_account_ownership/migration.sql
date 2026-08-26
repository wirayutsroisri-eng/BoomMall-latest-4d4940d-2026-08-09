-- Account ownership is enforced in PostgreSQL, not only in application code.
-- The cleanup clauses make this safe for pre-production databases containing
-- orphaned seed rows from before foreign keys existed.

-- userId is the one canonical account UUID. The redundant profile row id was
-- never referenced and is removed before real users exist.
ALTER TABLE "UserProfile" DROP CONSTRAINT "UserProfile_pkey";
ALTER TABLE "UserProfile" DROP COLUMN "id";
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId");

DELETE FROM "AuthIdentity" row WHERE NOT EXISTS (SELECT 1 FROM "UserProfile" p WHERE p."userId" = row."userId");
DELETE FROM "ChatParticipant" row WHERE NOT EXISTS (SELECT 1 FROM "UserProfile" p WHERE p."userId" = row."userId");
DELETE FROM "ChatMessageReaction" row WHERE NOT EXISTS (SELECT 1 FROM "UserProfile" p WHERE p."userId" = row."userId");
DELETE FROM "ProductPromotion" row WHERE NOT EXISTS (SELECT 1 FROM "UserProfile" p WHERE p."userId" = row."userId");
DELETE FROM "SellerNotification" row WHERE NOT EXISTS (SELECT 1 FROM "UserProfile" p WHERE p."userId" = row."userId");
DELETE FROM "SocialPost" row WHERE NOT EXISTS (SELECT 1 FROM "UserProfile" p WHERE p."userId" = row."authorId");
DELETE FROM "Story" row WHERE NOT EXISTS (SELECT 1 FROM "UserProfile" p WHERE p."userId" = row."userId");
DELETE FROM "StoryView" row WHERE NOT EXISTS (SELECT 1 FROM "UserProfile" p WHERE p."userId" = row."viewerId");
DELETE FROM "MediaAsset" row WHERE NOT EXISTS (SELECT 1 FROM "UserProfile" p WHERE p."userId" = row."ownerId");
DELETE FROM "Follow" row WHERE NOT EXISTS (SELECT 1 FROM "UserProfile" p WHERE p."userId" = row."followerId") OR NOT EXISTS (SELECT 1 FROM "UserProfile" p WHERE p."userId" = row."followingId");
DELETE FROM "SocialLike" row WHERE NOT EXISTS (SELECT 1 FROM "UserProfile" p WHERE p."userId" = row."userId") OR NOT EXISTS (SELECT 1 FROM "SocialPost" post WHERE post."id" = row."postId");
DELETE FROM "SocialComment" row WHERE NOT EXISTS (SELECT 1 FROM "UserProfile" p WHERE p."userId" = row."authorId") OR NOT EXISTS (SELECT 1 FROM "SocialPost" post WHERE post."id" = row."postId");
DELETE FROM "BoardThread" row WHERE NOT EXISTS (SELECT 1 FROM "UserProfile" p WHERE p."userId" = row."authorId");
DELETE FROM "BoardReply" row WHERE NOT EXISTS (SELECT 1 FROM "UserProfile" p WHERE p."userId" = row."authorId");
DELETE FROM "BoardVote" row WHERE NOT EXISTS (SELECT 1 FROM "UserProfile" p WHERE p."userId" = row."userId");
DELETE FROM "PushDevice" row WHERE NOT EXISTS (SELECT 1 FROM "UserProfile" p WHERE p."userId" = row."userId");

ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatParticipant" ADD CONSTRAINT "ChatParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageReaction" ADD CONSTRAINT "ChatMessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductPromotion" ADD CONSTRAINT "ProductPromotion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SellerNotification" ADD CONSTRAINT "SellerNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Story" ADD CONSTRAINT "Story_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialLike" ADD CONSTRAINT "SocialLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialLike" ADD CONSTRAINT "SocialLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardThread" ADD CONSTRAINT "BoardThread_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardReply" ADD CONSTRAINT "BoardReply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardVote" ADD CONSTRAINT "BoardVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Stable keyset pagination for profile feeds and histories.
CREATE INDEX IF NOT EXISTS "SocialPost_authorId_createdAt_id_idx" ON "SocialPost" ("authorId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "SocialComment_postId_createdAt_id_idx" ON "SocialComment" ("postId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "Story_userId_createdAt_id_idx" ON "Story" ("userId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "BehaviorEvent_userId_occurredAt_id_idx" ON "BehaviorEvent" ("userId", "occurredAt" DESC, "id" DESC);
