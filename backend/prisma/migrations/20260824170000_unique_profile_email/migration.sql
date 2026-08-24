CREATE UNIQUE INDEX IF NOT EXISTS "UserProfile_email_ci_key"
ON "UserProfile" (LOWER("email"))
WHERE "email" IS NOT NULL;
