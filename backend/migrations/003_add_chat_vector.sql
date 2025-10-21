-- Add chatVector to Chat table for compressed chat history
ALTER TABLE "Chat" 
ADD COLUMN IF NOT EXISTS "chatVector" JSONB,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

-- Create index on chatVector for faster queries
CREATE INDEX IF NOT EXISTS idx_chat_chatvector ON "Chat"("chatVector");

-- Update existing chats to have updatedAt timestamp
UPDATE "Chat" SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL;
