-- App Open ad placement (own migration: ADD VALUE cannot mix with use in some PG versions)

ALTER TYPE "AdPlacementType" ADD VALUE IF NOT EXISTS 'APP_OPEN';
