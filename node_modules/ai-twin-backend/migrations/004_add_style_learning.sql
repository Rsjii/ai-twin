-- Migration: Add Style Learning System
-- This migration adds support for few-shot learning, memory system, style corrections, and AI run tracking

-- 1. Create mem_bucket enum for memory categorization
DO $$ BEGIN
    CREATE TYPE mem_bucket AS ENUM ('facts', 'voice');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create style_anchors table for few-shot learning
CREATE TABLE IF NOT EXISTS "style_anchors" (
    "id" TEXT NOT NULL,
    "twin_id" TEXT NOT NULL,
    "user_utterance" TEXT NOT NULL,
    "ideal_reply" TEXT NOT NULL,
    "tags" TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "style_anchors_pkey" PRIMARY KEY ("id")
);

-- 3. Create mem_chunks table for memory system with vector embeddings
CREATE TABLE IF NOT EXISTS "mem_chunks" (
    "id" TEXT NOT NULL,
    "twin_id" TEXT NOT NULL,
    "bucket" mem_bucket NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" JSONB, -- For semantic search (will be converted to VECTOR later)
    "ts" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "mem_chunks_pkey" PRIMARY KEY ("id")
);

-- 4. Create style_corrections table for user feedback
CREATE TABLE IF NOT EXISTS "style_corrections" (
    "id" TEXT NOT NULL,
    "twin_id" TEXT NOT NULL,
    "knob" TEXT NOT NULL, -- shorter|casual|emoji_off|punchline
    "delta" INTEGER NOT NULL, -- +1|-1
    "source" TEXT,
    "ts" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "style_corrections_pkey" PRIMARY KEY ("id")
);

-- 5. Create ai_runs table for quality tracking
CREATE TABLE IF NOT EXISTS "ai_runs" (
    "id" TEXT NOT NULL,
    "twin_id" TEXT NOT NULL,
    "mode" TEXT, -- human|ai2ai
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "critic_score" INTEGER,
    "regen" BOOLEAN NOT NULL DEFAULT false,
    "latency_ms" INTEGER,
    "ts" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_style_anchors_twin_id" ON "style_anchors"("twin_id");
CREATE INDEX IF NOT EXISTS "idx_style_anchors_created_at" ON "style_anchors"("created_at");

CREATE INDEX IF NOT EXISTS "idx_mem_chunks_twin_id" ON "mem_chunks"("twin_id");
CREATE INDEX IF NOT EXISTS "idx_mem_chunks_bucket" ON "mem_chunks"("bucket");
CREATE INDEX IF NOT EXISTS "idx_mem_chunks_ts" ON "mem_chunks"("ts");
-- Note: Vector similarity index will be created when pgvector is set up
-- CREATE INDEX IF NOT EXISTS "idx_mem_chunks_embedding" ON "mem_chunks" USING ivfflat ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "idx_style_corrections_twin_id" ON "style_corrections"("twin_id");
CREATE INDEX IF NOT EXISTS "idx_style_corrections_knob" ON "style_corrections"("knob");
CREATE INDEX IF NOT EXISTS "idx_style_corrections_ts" ON "style_corrections"("ts");

CREATE INDEX IF NOT EXISTS "idx_ai_runs_twin_id" ON "ai_runs"("twin_id");
CREATE INDEX IF NOT EXISTS "idx_ai_runs_mode" ON "ai_runs"("mode");
CREATE INDEX IF NOT EXISTS "idx_ai_runs_ts" ON "ai_runs"("ts");
CREATE INDEX IF NOT EXISTS "idx_ai_runs_critic_score" ON "ai_runs"("critic_score");

-- 7. Add foreign key constraints
ALTER TABLE "style_anchors" DROP CONSTRAINT IF EXISTS "style_anchors_twin_id_fkey";
ALTER TABLE "style_anchors" ADD CONSTRAINT "style_anchors_twin_id_fkey" 
    FOREIGN KEY ("twin_id") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mem_chunks" DROP CONSTRAINT IF EXISTS "mem_chunks_twin_id_fkey";
ALTER TABLE "mem_chunks" ADD CONSTRAINT "mem_chunks_twin_id_fkey" 
    FOREIGN KEY ("twin_id") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "style_corrections" DROP CONSTRAINT IF EXISTS "style_corrections_twin_id_fkey";
ALTER TABLE "style_corrections" ADD CONSTRAINT "style_corrections_twin_id_fkey" 
    FOREIGN KEY ("twin_id") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_runs" DROP CONSTRAINT IF EXISTS "ai_runs_twin_id_fkey";
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_twin_id_fkey" 
    FOREIGN KEY ("twin_id") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. Add unique constraints where needed
CREATE UNIQUE INDEX IF NOT EXISTS "style_anchors_twin_id_user_utterance_key" 
    ON "style_anchors"("twin_id", "user_utterance");

-- 9. Insert default data if needed (optional)
-- No default data needed for these tables

-- 10. Update existing tables if needed
-- No updates to existing tables required

-- Migration completed successfully
SELECT 'Style learning system tables created successfully!' as status;