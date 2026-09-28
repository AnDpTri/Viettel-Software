CREATE TYPE "AccountTier" AS ENUM ('FREE', 'VIP');

ALTER TABLE "users"
ADD COLUMN "account_tier" "AccountTier" NOT NULL DEFAULT 'FREE',
ADD COLUMN "vip_expires_at" TIMESTAMP(3);

CREATE INDEX "users_account_tier_vip_expires_at_idx"
ON "users"("account_tier", "vip_expires_at");
