-- Migration: Add TwinPerformance table
-- Stores cached engagement and popularity scores for fast discover page queries

-- Create TwinPerformance table
CREATE TABLE IF NOT EXISTS "TwinPerformance" (
    "id" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "engagementScore" FLOAT DEFAULT 0,
    "popularityScore" FLOAT DEFAULT 0,
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT "TwinPerformance_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint for twinId (one record per twin)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_twin_performance_twinid" 
ON "TwinPerformance"("twinId");

-- Create indexes for fast queries (discover page sorting)
CREATE INDEX IF NOT EXISTS "idx_twin_performance_engagement" 
ON "TwinPerformance"("engagementScore" DESC);

CREATE INDEX IF NOT EXISTS "idx_twin_performance_popularity" 
ON "TwinPerformance"("popularityScore" DESC);

-- Add foreign key constraint
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TwinPerformance_twinId_fkey') THEN
        ALTER TABLE "TwinPerformance" 
        ADD CONSTRAINT "TwinPerformance_twinId_fkey" 
        FOREIGN KEY ("twinId") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

SELECT 'TwinPerformance table created successfully!' as status;