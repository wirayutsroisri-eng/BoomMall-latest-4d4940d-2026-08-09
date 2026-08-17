-- Feed Personalization Engine config + presets

CREATE TABLE "FeedPersonalizationConfig" (
    "id" TEXT NOT NULL DEFAULT 'GLOBAL_CONFIG',
    "interestMatchWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.35,
    "watchTimeWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "freshnessWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "creatorDiversityWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "systemSignalsWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "boostNewCreators" BOOLEAN NOT NULL DEFAULT true,
    "exploreNewInterests" BOOLEAN NOT NULL DEFAULT true,
    "reduceRepeatedContent" BOOLEAN NOT NULL DEFAULT true,
    "reduceLowQuality" BOOLEAN NOT NULL DEFAULT true,
    "geoProximityBoost" BOOLEAN NOT NULL DEFAULT true,
    "downrankReported" BOOLEAN NOT NULL DEFAULT true,
    "prioritizeEnergyPush" BOOLEAN NOT NULL DEFAULT true,
    "hideOutOfStock" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "FeedPersonalizationConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "configJson" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedPreset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedPreset_isActive_idx" ON "FeedPreset"("isActive");
