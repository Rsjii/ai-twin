-- Migration: Add Chat Management Features
-- This migration adds support for chat titles, summaries, and management

-- Add new columns to Chat table
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "summary" TEXT;
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "lastMessage" TEXT;
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "messageCount" INTEGER DEFAULT 0;

-- Update existing chats with default values
UPDATE "Chat" SET 
  "title" = 'Chat ' || EXTRACT(EPOCH FROM "createdAt")::TEXT,
  "messageCount" = (SELECT COUNT(*) FROM "Message" WHERE "chatId" = "Chat".id),
  "lastMessage" = (SELECT content FROM "Message" WHERE "chatId" = "Chat".id ORDER BY "createdAt" DESC LIMIT 1)
WHERE "title" IS NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_userid_createdat ON "Chat"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_chat_twinid ON "Chat"("twinId");
CREATE INDEX IF NOT EXISTS idx_message_chatid_createdat ON "Message"("chatId", "createdAt" DESC);