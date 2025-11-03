-- Migration: Add MemoryLongTerm table
-- Stores permanent facts and context that persist across all chats

-- Create MemoryLongTerm table
CREATE TABLE IF NOT EXISTS "MemoryLongTerm" (
    "id" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT, -- 'fact', 'preference', 'relationship', 'context', 'interest'
    "embedding" JSONB, -- For semantic search (optional, future use)
    "confidence" FLOAT DEFAULT 1.0,
    "source" TEXT, -- 'session', 'manual', 'feedback'
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT "MemoryLongTerm_pkey" PRIMARY KEY ("id")
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_memory_longterm_twinid" ON "MemoryLongTerm"("twinId");
CREATE INDEX IF NOT EXISTS "idx_memory_longterm_category" ON "MemoryLongTerm"("category");
CREATE INDEX IF NOT EXISTS "idx_memory_longterm_key" ON "MemoryLongTerm"("key");
CREATE INDEX IF NOT EXISTS "idx_memory_longterm_updatedat" ON "MemoryLongTerm"("updatedAt");

-- Add foreign key constraint
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MemoryLongTerm_twinId_fkey') THEN
        ALTER TABLE "MemoryLongTerm" 
        ADD CONSTRAINT "MemoryLongTerm_twinId_fkey" 
        FOREIGN KEY ("twinId") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Create unique constraint for (twinId + key) to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS "idx_memory_longterm_twinid_key" 
ON "MemoryLongTerm"("twinId", "key");

SELECT 'MemoryLongTerm table created successfully!' as status;