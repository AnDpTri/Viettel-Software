ALTER TABLE "agent_actions"
ADD COLUMN "batch_id" UUID;

CREATE INDEX "agent_actions_batch_id_idx"
ON "agent_actions"("batch_id");
