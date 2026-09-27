-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');
CREATE TYPE "WalletType" AS ENUM ('CASH', 'BANK', 'E_WALLET', 'CREDIT', 'OTHER');
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
  "id" UUID NOT NULL, "username" VARCHAR(50) NOT NULL, "email" VARCHAR(255),
  "phone" VARCHAR(20), "password_hash" TEXT NOT NULL, "full_name" VARCHAR(120),
  "timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh', "currency" CHAR(3) NOT NULL DEFAULT 'VND',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "refresh_tokens" (
  "id" UUID NOT NULL, "token_hash" TEXT NOT NULL, "user_id" UUID NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL, "revoked_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "password_reset_tokens" (
  "id" UUID NOT NULL, "token_hash" TEXT NOT NULL, "user_id" UUID NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL, "used_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "wallets" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "name" VARCHAR(100) NOT NULL,
  "type" "WalletType" NOT NULL DEFAULT 'CASH', "currency" CHAR(3) NOT NULL DEFAULT 'VND',
  "opening_balance" DECIMAL(19,4) NOT NULL DEFAULT 0, "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "categories" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "parent_id" UUID, "name" VARCHAR(100) NOT NULL,
  "type" "TransactionType" NOT NULL, "icon" VARCHAR(50), "color" VARCHAR(7),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "transactions" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "wallet_id" UUID NOT NULL,
  "destination_wallet_id" UUID, "category_id" UUID, "type" "TransactionType" NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL, "occurred_at" TIMESTAMP(3) NOT NULL, "note" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transaction_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "transfer_destination_required" CHECK (("type" <> 'TRANSFER') OR ("destination_wallet_id" IS NOT NULL AND "destination_wallet_id" <> "wallet_id"))
);
CREATE TABLE "receipts" (
  "id" UUID NOT NULL, "transaction_id" UUID NOT NULL, "original_name" VARCHAR(255) NOT NULL,
  "stored_name" VARCHAR(255) NOT NULL, "mime_type" VARCHAR(100) NOT NULL, "size" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "budgets" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "category_id" UUID, "name" VARCHAR(100) NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL, "start_date" DATE NOT NULL, "end_date" DATE NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "budgets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "budget_amount_positive" CHECK ("amount" > 0), CONSTRAINT "budget_date_valid" CHECK ("end_date" >= "start_date")
);
CREATE TABLE "goals" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "wallet_id" UUID, "name" VARCHAR(120) NOT NULL,
  "target_amount" DECIMAL(19,4) NOT NULL, "current_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "target_date" DATE, "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "goals_pkey" PRIMARY KEY ("id"), CONSTRAINT "goal_amount_positive" CHECK ("target_amount" > 0),
  CONSTRAINT "goal_current_nonnegative" CHECK ("current_amount" >= 0)
);
CREATE TABLE "goal_contributions" (
  "id" UUID NOT NULL, "goal_id" UUID NOT NULL, "amount" DECIMAL(19,4) NOT NULL,
  "note" VARCHAR(255), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "goal_contributions_pkey" PRIMARY KEY ("id"), CONSTRAINT "contribution_amount_nonzero" CHECK ("amount" <> 0)
);

-- Indexes
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");
CREATE UNIQUE INDEX "wallets_user_id_name_key" ON "wallets"("user_id", "name");
CREATE INDEX "wallets_user_id_idx" ON "wallets"("user_id");
CREATE UNIQUE INDEX "categories_user_id_parent_id_name_type_key" ON "categories"("user_id", "parent_id", "name", "type");
CREATE INDEX "categories_user_id_type_idx" ON "categories"("user_id", "type");
CREATE INDEX "transactions_user_id_occurred_at_idx" ON "transactions"("user_id", "occurred_at");
CREATE INDEX "transactions_wallet_id_occurred_at_idx" ON "transactions"("wallet_id", "occurred_at");
CREATE INDEX "receipts_transaction_id_idx" ON "receipts"("transaction_id");
CREATE INDEX "budgets_user_id_start_date_end_date_idx" ON "budgets"("user_id", "start_date", "end_date");
CREATE INDEX "goals_user_id_status_idx" ON "goals"("user_id", "status");
CREATE INDEX "goal_contributions_goal_id_created_at_idx" ON "goal_contributions"("goal_id", "created_at");

-- Foreign keys
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_destination_wallet_id_fkey" FOREIGN KEY ("destination_wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE;
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL;
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE SET NULL;
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE;
