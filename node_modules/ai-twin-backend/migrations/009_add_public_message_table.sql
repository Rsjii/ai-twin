-- Migration: Add PublicMessage Table
-- This migration creates a separate PublicMessage table for public chat messages
-- to avoid foreign key conflicts with the existing Message table

-- Create PublicMessage table
CREATE TABLE IF NOT EXISTS "PublicMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "content" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicMessage_pkey" PRIMARY KEY ("id")
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_publicmessage_chatid_createdat" ON "PublicMessage"("chatId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_publicmessage_sender" ON "PublicMessage"("sender");

-- Add foreign key constraint
ALTER TABLE "PublicMessage" DROP CONSTRAINT IF EXISTS "PublicMessage_chatId_fkey";
ALTER TABLE "PublicMessage" ADD CONSTRAINT "PublicMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "PublicChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add comment to table
COMMENT ON TABLE "PublicMessage" IS 'Messages for public chats, separate from regular user messages';
COMMENT ON COLUMN "PublicMessage"."chatId" IS 'References PublicChat.id';
COMMENT ON COLUMN "PublicMessage"."sender" IS 'Either human or twin';
COMMENT ON COLUMN "PublicMessage"."approved" IS 'Whether message passed moderation';
