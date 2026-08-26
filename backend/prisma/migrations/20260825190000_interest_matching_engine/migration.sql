CREATE TYPE "InterestSource" AS ENUM ('PROFILE', 'SEARCH', 'VIEW', 'LIKE', 'SAVE', 'COMMENT', 'CHAT', 'PURCHASE', 'SELL', 'JOB', 'SERVICE', 'SHARE', 'NEGATIVE');

CREATE TABLE "UserInterestProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "explicitInterestsJson" JSONB NOT NULL DEFAULT '[]',
  "occupation" TEXT,
  "occupationVisible" BOOLEAN NOT NULL DEFAULT false,
  "careerField" TEXT,
  "careerFieldVisible" BOOLEAN NOT NULL DEFAULT false,
  "skillsJson" JSONB NOT NULL DEFAULT '[]',
  "skillsVisible" BOOLEAN NOT NULL DEFAULT false,
  "interestsVisible" BOOLEAN NOT NULL DEFAULT false,
  "preferredCategoriesJson" JSONB NOT NULL DEFAULT '[]',
  "categoriesVisible" BOOLEAN NOT NULL DEFAULT false,
  "behavioralInterestsJson" JSONB NOT NULL DEFAULT '[]',
  "searchInterestsJson" JSONB NOT NULL DEFAULT '[]',
  "locationPreferencesJson" JSONB NOT NULL DEFAULT '[]',
  "personalizationEnabled" BOOLEAN NOT NULL DEFAULT true,
  "vectorVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserInterestProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserInterestProfile_userId_key" ON "UserInterestProfile"("userId");
CREATE INDEX "UserInterestProfile_updatedAt_idx" ON "UserInterestProfile"("updatedAt");

CREATE TABLE "BehaviorEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "contentId" TEXT,
  "contentType" TEXT,
  "tagsJson" JSONB NOT NULL DEFAULT '[]',
  "query" TEXT,
  "source" "InterestSource" NOT NULL,
  "weightDelta" DOUBLE PRECISION NOT NULL,
  "durationMs" INTEGER,
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BehaviorEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BehaviorEvent_userId_occurredAt_idx" ON "BehaviorEvent"("userId", "occurredAt");
CREATE INDEX "BehaviorEvent_contentType_contentId_idx" ON "BehaviorEvent"("contentType", "contentId");
CREATE INDEX "BehaviorEvent_eventType_createdAt_idx" ON "BehaviorEvent"("eventType", "createdAt");

CREATE TABLE "RecommendationConfig" (
  "id" TEXT NOT NULL DEFAULT 'GLOBAL_RECOMMENDATION',
  "interestWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
  "recentBehaviorWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
  "searchIntentWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.20,
  "locationWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
  "freshnessWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
  "popularityWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
  "negativeSignalWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.00,
  "decayHalfLifeDays" DOUBLE PRECISION NOT NULL DEFAULT 30,
  "eventWeightsJson" JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" TEXT,
  CONSTRAINT "RecommendationConfig_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UserInterestProfile" ADD CONSTRAINT "UserInterestProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BehaviorEvent" ADD CONSTRAINT "BehaviorEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
