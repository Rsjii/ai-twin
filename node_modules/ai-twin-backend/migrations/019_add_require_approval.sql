-- Migration: Add requireApproval column to ModerationSettings
-- This enables per-twin moderation control

-- Add requireApproval to ModerationSettings
ALTER TABLE "ModerationSettings" 
ADD COLUMN IF NOT EXISTS "requireApproval" BOOLEAN DEFAULT false;

-- Add requireApproval to Twin (optional per-twin setting)
ALTER TABLE "Twin" 
ADD COLUMN IF NOT EXISTS "requireApproval" BOOLEAN DEFAULT false;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS "idx_moderation_settings_requireapproval" 
ON "ModerationSettings"("requireApproval");

SELECT 'requireApproval column added successfully!' as status;

