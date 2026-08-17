-- Chat sequence, idempotency, attachments, read cursor

ALTER TABLE "ChatConversation" ADD COLUMN IF NOT EXISTS "lastSequence" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "ChatConversation" ADD COLUMN IF NOT EXISTS "lastMessageAt" TIMESTAMP(3);

ALTER TABLE "ChatParticipant" ADD COLUMN IF NOT EXISTS "lastReadSequence" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'TEXT';
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "serverSequence" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "replyToMessageId" TEXT;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "conversationId" ORDER BY "createdAt" ASC, id ASC) AS seq
  FROM "ChatMessage"
)
UPDATE "ChatMessage" AS m
SET "serverSequence" = ordered.seq
FROM ordered
WHERE m.id = ordered.id AND m."serverSequence" = 0;

UPDATE "ChatConversation" AS c
SET "lastSequence" = COALESCE(
  (SELECT MAX(m."serverSequence") FROM "ChatMessage" m WHERE m."conversationId" = c.id),
  0
);

CREATE INDEX IF NOT EXISTS "ChatMessage_conversationId_serverSequence_idx"
  ON "ChatMessage"("conversationId", "serverSequence");

CREATE UNIQUE INDEX IF NOT EXISTS "ChatMessage_senderId_clientMsgId_key"
  ON "ChatMessage"("senderId", "clientMsgId");

DO $$
BEGIN
  ALTER TABLE "ChatMessage"
    ADD CONSTRAINT "ChatMessage_replyToMessageId_fkey"
    FOREIGN KEY ("replyToMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ChatMessageAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessageAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChatMessageAttachment_messageId_idx" ON "ChatMessageAttachment"("messageId");

DO $$
BEGIN
  ALTER TABLE "ChatMessageAttachment"
    ADD CONSTRAINT "ChatMessageAttachment_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ChatMessageReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessageReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatMessageReaction_messageId_userId_emoji_key"
  ON "ChatMessageReaction"("messageId", "userId", "emoji");
CREATE INDEX IF NOT EXISTS "ChatMessageReaction_messageId_idx" ON "ChatMessageReaction"("messageId");

DO $$
BEGIN
  ALTER TABLE "ChatMessageReaction"
    ADD CONSTRAINT "ChatMessageReaction_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
