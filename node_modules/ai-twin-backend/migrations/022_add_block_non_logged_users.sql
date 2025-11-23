-- Add blockNonLoggedUsers column to Twin table
ALTER TABLE "Twin" 
ADD COLUMN IF NOT EXISTS "blockNonLoggedUsers" BOOLEAN DEFAULT false;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS "idx_twin_block_non_logged" 
ON "Twin"("blockNonLoggedUsers", "isPublic") 
WHERE "isPublic" = true;