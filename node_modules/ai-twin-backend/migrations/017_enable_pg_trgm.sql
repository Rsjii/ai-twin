-- Migration: Enable pg_trgm extension for similarity search
-- This enables PostgreSQL's trigram similarity matching for style_anchors table
-- File: backend/migrations/017_enable_pg_trgm.sql

-- Enable pg_trgm extension (required for similarity() function)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN index for better performance on similarity searches
-- This index speeds up similarity queries on user_utterance column
CREATE INDEX IF NOT EXISTS idx_style_anchors_user_utterance_trgm 
ON style_anchors USING gin (user_utterance gin_trgm_ops);

-- Migration completed
SELECT 'pg_trgm extension enabled successfully!' as status;