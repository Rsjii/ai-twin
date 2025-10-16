-- Enhanced Onboarding Migration
-- Add new columns to User table for enhanced onboarding data

ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS "personaData" JSONB,
ADD COLUMN IF NOT EXISTS "onboardingCompleted" BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

-- Add new columns to Twin table for enhanced twin data
ALTER TABLE "Twin"
ADD COLUMN IF NOT EXISTS "personaData" JSONB,
ADD COLUMN IF NOT EXISTS "systemPrompt" TEXT,
ADD COLUMN IF NOT EXISTS "tokenLimit" INTEGER DEFAULT 500,
ADD COLUMN IF NOT EXISTS "tier" VARCHAR(20) DEFAULT 'free',
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

-- Create index on onboardingCompleted for faster queries
CREATE INDEX IF NOT EXISTS idx_user_onboarding_completed ON "User"("onboardingCompleted");

-- Create index on tier for twin queries
CREATE INDEX IF NOT EXISTS idx_twin_tier ON "Twin"("tier");

-- Update existing users to have onboardingCompleted = false
UPDATE "User" SET "onboardingCompleted" = FALSE WHERE "onboardingCompleted" IS NULL;

-- Update existing twins to have default values
UPDATE "Twin" SET 
  "tokenLimit" = 500,
  "tier" = 'free'
WHERE "tokenLimit" IS NULL OR "tier" IS NULL;
