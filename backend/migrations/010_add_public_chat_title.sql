-- Migration: Add Multi-Chat Support for Public Chats
-- Simple version - just adds title/summary fields and basic indexes

-- Add title and summary fields to PublicChat table
ALTER TABLE "PublicChat" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "PublicChat" ADD COLUMN IF NOT EXISTS "summary" TEXT;

-- Update existing records with default values
UPDATE "PublicChat" SET 
    "title" = 'Chat #' || SUBSTRING("id", -6),
    "summary" = ''
WHERE "title" IS NULL OR "summary" IS NULL;

-- Add basic indexes for performance
CREATE INDEX IF NOT EXISTS "idx_publicchat_twinid_visitorid" 
ON "PublicChat"("twinId", "visitorId");

CREATE INDEX IF NOT EXISTS "idx_publicchat_visitorid" 
ON "PublicChat"("visitorId");