-- Migration: Add userId column to PublicChat table
-- This allows tracking public chats for logged-in users separately from anonymous visitors

-- Add userId column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'PublicChat' AND column_name = 'userId') THEN
        ALTER TABLE "PublicChat" ADD COLUMN "userId" TEXT;
    END IF;
END $$;

-- Create index for performance (user queries)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes 
                   WHERE tablename = 'PublicChat' AND indexname = 'idx_publicchat_userid') THEN
        CREATE INDEX "idx_publicchat_userid" ON "PublicChat"("userId");
    END IF;
END $$;

-- Optional: Migrate existing data if visitorId matches User IDs
-- This checks if visitorId exists in User table and copies to userId
DO $$ 
DECLARE
    chat_record RECORD;
BEGIN
    FOR chat_record IN 
        SELECT pc.id, pc."visitorId"
        FROM "PublicChat" pc
        WHERE pc."userId" IS NULL 
          AND pc."visitorId" IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM "User" u WHERE u.id = pc."visitorId"
          )
    LOOP
        UPDATE "PublicChat" 
        SET "userId" = chat_record."visitorId"
        WHERE id = chat_record.id;
    END LOOP;
END $$;

-- Add composite index for common queries (userId + twinId)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes 
                   WHERE tablename = 'PublicChat' AND indexname = 'idx_publicchat_userid_twinid') THEN
        CREATE INDEX "idx_publicchat_userid_twinid" ON "PublicChat"("userId", "twinId");
    END IF;
END $$;