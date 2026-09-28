CREATE TYPE "AgentActionStatus" AS ENUM ('PENDING', 'EXECUTED', 'CANCELLED', 'FAILED', 'UNDONE', 'EXPIRED');

CREATE TABLE "agent_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "risk" VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    "status" "AgentActionStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "preview" JSONB NOT NULL,
    "result" JSONB,
    "undo_data" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_actions_user_id_status_created_at_idx" ON "agent_actions"("user_id", "status", "created_at");
CREATE INDEX "agent_actions_conversation_id_created_at_idx" ON "agent_actions"("conversation_id", "created_at");

ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "assistant_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
