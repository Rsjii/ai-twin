-- Migration: Add MemorySession table
-- Stores session-level summaries for chat conversations

-- Create MemorySession table
CREATE TABLE IF NOT EXISTS "MemorySession" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "vector" JSONB,
    "keyTopics" TEXT[],
    "messageCount" INTEGER DEFAULT 0,
    "lastUpdated" TIMESTAMPTZ DEFAULT NOW(),
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT "MemorySession_pkey" PRIMARY KEY ("id")
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_memory_session_chatid" ON "MemorySession"("chatId");
CREATE INDEX IF NOT EXISTS "idx_memory_session_lastupdated" ON "MemorySession"("lastUpdated");

-- Add foreign key constraint
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MemorySession_chatId_fkey') THEN
        ALTER TABLE "MemorySession" 
        ADD CONSTRAINT "MemorySession_chatId_fkey" 
        FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

SELECT 'MemorySession table created successfully!' as status;