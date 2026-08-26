-- Production friend identity: human-readable codes, revocable QR invites,
-- directional requests and accepted contacts. UUID remains the canonical user FK.

CREATE OR REPLACE FUNCTION generate_friend_code()
RETURNS VARCHAR(12)
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  candidate VARCHAR(12);
BEGIN
  LOOP
    candidate := 'BM-' || UPPER(TRANSLATE(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 7), '01', '23'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM "UserProfile" WHERE UPPER("friend_code") = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

ALTER TABLE "UserProfile" ADD COLUMN "friend_code" VARCHAR(12) DEFAULT generate_friend_code();

UPDATE "UserProfile"
SET "friend_code" = 'BM-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 7))
WHERE "friend_code" IS NULL;

ALTER TABLE "UserProfile" ALTER COLUMN "friend_code" SET NOT NULL;
CREATE UNIQUE INDEX "UserProfile_friend_code_key" ON "UserProfile"("friend_code");
CREATE UNIQUE INDEX "UserProfile_friend_code_ci_key" ON "UserProfile"(UPPER("friend_code"));

CREATE TYPE "FriendRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

CREATE TABLE "friend_invites" (
  "id" BIGINT PRIMARY KEY DEFAULT generate_snowflake_id(),
  "owner_user_id" TEXT NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "friend_invites_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "friend_invites_token_hash_key" ON "friend_invites"("token_hash");
CREATE INDEX "friend_invites_owner_active_idx" ON "friend_invites"("owner_user_id", "revoked_at", "expires_at");

CREATE TABLE "friend_requests" (
  "id" BIGINT PRIMARY KEY DEFAULT generate_snowflake_id(),
  "pair_key" VARCHAR(73) NOT NULL,
  "sender_id" TEXT NOT NULL,
  "receiver_id" TEXT NOT NULL,
  "status" "FriendRequestStatus" NOT NULL DEFAULT 'PENDING',
  "message" VARCHAR(200),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "responded_at" TIMESTAMP(3),
  CONSTRAINT "friend_requests_not_self_check" CHECK ("sender_id" <> "receiver_id"),
  CONSTRAINT "friend_requests_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "friend_requests_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "friend_requests_pair_key_key" ON "friend_requests"("pair_key");
CREATE INDEX "friend_requests_sender_status_idx" ON "friend_requests"("sender_id", "status");
CREATE INDEX "friend_requests_receiver_status_idx" ON "friend_requests"("receiver_id", "status");

CREATE TABLE "contacts" (
  "id" BIGINT PRIMARY KEY DEFAULT generate_snowflake_id(),
  "user_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "nickname" VARCHAR(50),
  "is_favorite" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contacts_not_self_check" CHECK ("user_id" <> "contact_id"),
  CONSTRAINT "contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "contacts_user_id_contact_id_key" ON "contacts"("user_id", "contact_id");
CREATE INDEX "contacts_contact_id_idx" ON "contacts"("contact_id");
