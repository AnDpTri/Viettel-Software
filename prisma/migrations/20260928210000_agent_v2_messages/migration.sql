CREATE TYPE "AssistantMessageStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "assistant_messages"
ADD COLUMN "status" "AssistantMessageStatus" NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN "error_code" VARCHAR(80),
ADD COLUMN "finish_reason" VARCHAR(40),
ADD COLUMN "provider_request_id" VARCHAR(160),
ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "retry_of_message_id" UUID;
