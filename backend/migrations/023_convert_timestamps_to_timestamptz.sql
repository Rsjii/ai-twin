-- Migration: Convert TIMESTAMP(3) to TIMESTAMPTZ(3) for proper UTC storage
-- This fixes the 5.5 hour offset issue by storing true UTC timestamps

-- ✅ ALREADY DONE: PublicMessage and PublicChat (converted in previous run)

-- Convert Message.createdAt (PRIVATE CHAT MESSAGES)
ALTER TABLE "Message"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'Asia/Calcutta';

-- Convert Chat.createdAt (PRIVATE CHATS)
ALTER TABLE "Chat"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3)
  USING "createdAt" AT TIME ZONE 'Asia/Calcutta';

-- Convert Chat.updatedAt (PRIVATE CHATS)
ALTER TABLE "Chat"
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3)
  USING "updatedAt" AT TIME ZONE 'Asia/Calcutta';

-- Add comments
COMMENT ON COLUMN "Message"."createdAt" IS 'UTC timestamp with timezone';
COMMENT ON COLUMN "Chat"."createdAt" IS 'UTC timestamp with timezone';
COMMENT ON COLUMN "Chat"."updatedAt" IS 'UTC timestamp with timezone';