-- Chat domain: conversations, participants, messages (realtime flush target)

CREATE TYPE "ChatConversationType" AS ENUM ('DIRECT', 'SHOP', 'GROUP');
CREATE TYPE "ChatMessageStatus" AS ENUM ('CACHED', 'PERSISTED', 'DELETED');

CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "type" "ChatConversationType" NOT NULL DEFAULT 'SHOP',
    "shopId" TEXT,
    "shopName" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatParticipant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ChatMessageStatus" NOT NULL DEFAULT 'CACHED',
    "clientMsgId" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "persistedAt" TIMESTAMP(3),

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatConversation_type_shopId_idx" ON "ChatConversation"("type", "shopId");
CREATE INDEX "ChatConversation_updatedAt_idx" ON "ChatConversation"("updatedAt");
CREATE INDEX "ChatParticipant_userId_idx" ON "ChatParticipant"("userId");
CREATE UNIQUE INDEX "ChatParticipant_conversationId_userId_key" ON "ChatParticipant"("conversationId", "userId");
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");
CREATE INDEX "ChatMessage_status_createdAt_idx" ON "ChatMessage"("status", "createdAt");
CREATE UNIQUE INDEX "ChatMessage_conversationId_clientMsgId_key" ON "ChatMessage"("conversationId", "clientMsgId");

ALTER TABLE "ChatParticipant" ADD CONSTRAINT "ChatParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
