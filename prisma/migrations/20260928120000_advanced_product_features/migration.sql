CREATE TYPE "TransactionStatus" AS ENUM ('PLANNED', 'PENDING', 'CLEARED', 'RECONCILED', 'CANCELLED');
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH');
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'MANAGER', 'MEMBER', 'VIEWER');
CREATE TYPE "BillStatus" AS ENUM ('UPCOMING', 'PAID', 'OVERDUE', 'SKIPPED');

ALTER TABLE "users"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "email_verified_at" TIMESTAMP(3),
  ADD COLUMN "phone_verified_at" TIMESTAMP(3),
  ADD COLUMN "locale" VARCHAR(20) NOT NULL DEFAULT 'vi-VN',
  ADD COLUMN "theme" VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "preferences" JSONB;

ALTER TABLE "refresh_tokens"
  ADD COLUMN "device_name" VARCHAR(120),
  ADD COLUMN "family_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN "ip_address" VARCHAR(64),
  ADD COLUMN "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "user_agent" VARCHAR(500);

ALTER TABLE "wallets"
  ADD COLUMN "billing_day" INTEGER,
  ADD COLUMN "color" VARCHAR(7),
  ADD COLUMN "credit_limit" DECIMAL(19,4),
  ADD COLUMN "due_day" INTEGER,
  ADD COLUMN "household_id" UUID,
  ADD COLUMN "icon" VARCHAR(50),
  ADD COLUMN "include_in_net_worth" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "institution_name" VARCHAR(120),
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "categories"
  ADD COLUMN "archived_at" TIMESTAMP(3),
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "transactions"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "idempotency_key" VARCHAR(100),
  ADD COLUMN "location" VARCHAR(255),
  ADD COLUMN "merchant_id" UUID,
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "payee" VARCHAR(160),
  ADD COLUMN "payment_method" VARCHAR(50),
  ADD COLUMN "recurring_rule_id" UUID,
  ADD COLUMN "reference" VARCHAR(120),
  ADD COLUMN "status" "TransactionStatus" NOT NULL DEFAULT 'CLEARED';

ALTER TABLE "budgets"
  ADD COLUMN "alert_thresholds" JSONB,
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "recurrence" "RecurrenceFrequency",
  ADD COLUMN "rollover" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "goals"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "paused_at" TIMESTAMP(3),
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "recurring_amount" DECIMAL(19,4),
  ADD COLUMN "recurring_frequency" "RecurrenceFrequency";

ALTER TABLE "goal_contributions" ADD COLUMN "transaction_id" UUID;

CREATE TABLE "oauth_accounts" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "provider" VARCHAR(30) NOT NULL,
  "provider_user_id" VARCHAR(255) NOT NULL, "provider_email" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "verification_tokens" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "type" VARCHAR(30) NOT NULL, "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL, "used_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transaction_splits" (
  "id" UUID NOT NULL, "transaction_id" UUID NOT NULL, "category_id" UUID,
  "amount" DECIMAL(19,4) NOT NULL, "note" VARCHAR(255),
  CONSTRAINT "transaction_splits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tags" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "name" VARCHAR(50) NOT NULL, "color" VARCHAR(7),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "merchants" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "name" VARCHAR(160) NOT NULL,
  "default_category_id" UUID, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recurring_rules" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "wallet_id" UUID NOT NULL, "category_id" UUID,
  "name" VARCHAR(120) NOT NULL, "type" "TransactionType" NOT NULL, "amount" DECIMAL(19,4) NOT NULL,
  "frequency" "RecurrenceFrequency" NOT NULL, "interval" INTEGER NOT NULL DEFAULT 1,
  "next_run_at" TIMESTAMP(3) NOT NULL, "end_at" TIMESTAMP(3), "auto_post" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true, "note" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recurring_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bills" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "wallet_id" UUID, "name" VARCHAR(120) NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL, "due_at" TIMESTAMP(3) NOT NULL,
  "status" "BillStatus" NOT NULL DEFAULT 'UPCOMING', "recurrence" "RecurrenceFrequency",
  "reminder_days" INTEGER[] DEFAULT ARRAY[1,3,7]::INTEGER[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transaction_templates" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "wallet_id" UUID NOT NULL, "category_id" UUID,
  "name" VARCHAR(120) NOT NULL, "type" "TransactionType" NOT NULL, "amount" DECIMAL(19,4), "note" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transaction_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation_rules" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "name" VARCHAR(120) NOT NULL,
  "field" VARCHAR(30) NOT NULL, "operator" VARCHAR(30) NOT NULL, "value" VARCHAR(255) NOT NULL,
  "category_id" UUID, "tag_name" VARCHAR(50), "priority" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "type" VARCHAR(50) NOT NULL,
  "title" VARCHAR(160) NOT NULL, "message" VARCHAR(500) NOT NULL,
  "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP', "read_at" TIMESTAMP(3),
  "action_url" VARCHAR(500), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL, "user_id" UUID, "action" VARCHAR(80) NOT NULL, "entity_type" VARCHAR(80),
  "entity_id" VARCHAR(100), "ip_address" VARCHAR(64), "user_agent" VARCHAR(500), "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exchange_rates" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "base_currency" CHAR(3) NOT NULL,
  "quote_currency" CHAR(3) NOT NULL, "rate" DECIMAL(20,8) NOT NULL, "effective_at" TIMESTAMP(3) NOT NULL,
  "source" VARCHAR(30) NOT NULL DEFAULT 'MANUAL', CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "households" (
  "id" UUID NOT NULL, "owner_id" UUID NOT NULL, "name" VARCHAR(120) NOT NULL,
  "invite_code" VARCHAR(32) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "household_members" (
  "id" UUID NOT NULL, "household_id" UUID NOT NULL, "user_id" UUID NOT NULL,
  "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER', "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "household_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "_TagToTransaction" (
  "A" UUID NOT NULL, "B" UUID NOT NULL,
  CONSTRAINT "_TagToTransaction_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE UNIQUE INDEX "oauth_accounts_provider_provider_user_id_key" ON "oauth_accounts"("provider", "provider_user_id");
CREATE UNIQUE INDEX "oauth_accounts_user_id_provider_key" ON "oauth_accounts"("user_id", "provider");
CREATE UNIQUE INDEX "verification_tokens_token_hash_key" ON "verification_tokens"("token_hash");
CREATE INDEX "verification_tokens_user_id_type_idx" ON "verification_tokens"("user_id", "type");
CREATE INDEX "transaction_splits_transaction_id_idx" ON "transaction_splits"("transaction_id");
CREATE UNIQUE INDEX "tags_user_id_name_key" ON "tags"("user_id", "name");
CREATE UNIQUE INDEX "merchants_user_id_name_key" ON "merchants"("user_id", "name");
CREATE INDEX "recurring_rules_user_id_active_next_run_at_idx" ON "recurring_rules"("user_id", "active", "next_run_at");
CREATE INDEX "bills_user_id_status_due_at_idx" ON "bills"("user_id", "status", "due_at");
CREATE UNIQUE INDEX "transaction_templates_user_id_name_key" ON "transaction_templates"("user_id", "name");
CREATE INDEX "automation_rules_user_id_active_priority_idx" ON "automation_rules"("user_id", "active", "priority");
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");
CREATE INDEX "exchange_rates_user_id_effective_at_idx" ON "exchange_rates"("user_id", "effective_at");
CREATE UNIQUE INDEX "exchange_rates_user_id_base_currency_quote_currency_effecti_key" ON "exchange_rates"("user_id", "base_currency", "quote_currency", "effective_at");
CREATE UNIQUE INDEX "households_invite_code_key" ON "households"("invite_code");
CREATE UNIQUE INDEX "household_members_household_id_user_id_key" ON "household_members"("household_id", "user_id");
CREATE INDEX "_TagToTransaction_B_index" ON "_TagToTransaction"("B");
CREATE INDEX "transactions_user_id_deleted_at_occurred_at_idx" ON "transactions"("user_id", "deleted_at", "occurred_at");
CREATE UNIQUE INDEX "transactions_user_id_idempotency_key_key" ON "transactions"("user_id", "idempotency_key");

ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "households" ADD CONSTRAINT "households_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_rule_id_fkey" FOREIGN KEY ("recurring_rule_id") REFERENCES "recurring_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bills" ADD CONSTRAINT "bills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bills" ADD CONSTRAINT "bills_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transaction_templates" ADD CONSTRAINT "transaction_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_templates" ADD CONSTRAINT "transaction_templates_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_templates" ADD CONSTRAINT "transaction_templates_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_TagToTransaction" ADD CONSTRAINT "_TagToTransaction_A_fkey" FOREIGN KEY ("A") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_TagToTransaction" ADD CONSTRAINT "_TagToTransaction_B_fkey" FOREIGN KEY ("B") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
