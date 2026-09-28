ALTER TABLE "assistant_conversations"
ADD COLUMN "summary" TEXT,
ADD COLUMN "summary_updated_at" TIMESTAMP(3);

CREATE TABLE "assistant_memories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "kind" VARCHAR(30) NOT NULL DEFAULT 'PREFERENCE',
    "content" TEXT NOT NULL,
    "source_message_id" UUID,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "confirmed" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assistant_memories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assistant_memories_user_id_kind_updated_at_idx" ON "assistant_memories"("user_id", "kind", "updated_at");
ALTER TABLE "assistant_memories" ADD CONSTRAINT "assistant_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
