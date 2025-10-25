-- File: backend/migrations/005_add_twin_tracking.sql
-- Migration: Add Twin Tracking Columns

-- Add tracking columns to Twin table
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "last_updated" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "style_version" INTEGER DEFAULT 1;

-- Add public/private memory flag to mem_chunks
ALTER TABLE "mem_chunks" ADD COLUMN IF NOT EXISTS "is_public" BOOLEAN DEFAULT FALSE;

-- Add feedback tracking to ai_runs
ALTER TABLE "ai_runs" ADD COLUMN IF NOT EXISTS "feedback_score" INTEGER;
ALTER TABLE "ai_runs" ADD COLUMN IF NOT EXISTS "user_rating" TEXT; -- 'up'|'down'

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_twin_last_updated" ON "Twin"("last_updated");
CREATE INDEX IF NOT EXISTS "idx_mem_chunks_public" ON "mem_chunks"("is_public");

-- Migration completed successfully
SELECT 'Twin tracking columns added successfully!' as status;