-- Migration: Add requestId for idempotency (backend-generated)
-- Prevents duplicate messages from retries/double-clicks

-- Add requestId to Message table
ALTER TABLE "Message" 
ADD COLUMN IF NOT EXISTS "requestId" TEXT;

-- Add requestId to PublicMessage table
ALTER TABLE "PublicMessage" 
ADD COLUMN IF NOT EXISTS "requestId" TEXT;

-- Create unique constraint to prevent duplicate requestId in same chat
CREATE UNIQUE INDEX IF NOT EXISTS "idx_message_chatid_requestid_unique" 
ON "Message"("chatId", "requestId");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_publicmessage_chatid_requestid_unique" 
ON "PublicMessage"("chatId", "requestId");

SELECT 'requestId columns added successfully!' as status;