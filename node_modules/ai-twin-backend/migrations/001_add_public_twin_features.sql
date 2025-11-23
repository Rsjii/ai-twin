-- Migration: Add Public Twin Features
-- This migration adds support for public twin profiles, likes, follows, and public chats

-- Add new columns to Twin table
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN DEFAULT false;
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "publicHandle" TEXT;
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "bio" TEXT;
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "profileImage" TEXT;
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "verified" BOOLEAN DEFAULT false;
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "likeCount" INTEGER DEFAULT 0;
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "followCount" INTEGER DEFAULT 0;
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "chatCount" INTEGER DEFAULT 0;

-- Create TwinLike table
CREATE TABLE IF NOT EXISTS "TwinLike" (
    "id" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwinLike_pkey" PRIMARY KEY ("id")
);

-- Create TwinFollow table
CREATE TABLE IF NOT EXISTS "TwinFollow" (
    "id" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwinFollow_pkey" PRIMARY KEY ("id")
);

-- Create PublicChat table
CREATE TABLE IF NOT EXISTS "PublicChat" (
    "id" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "visitorId" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicChat_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS "Twin_publicHandle_key" ON "Twin"("publicHandle");
CREATE UNIQUE INDEX IF NOT EXISTS "TwinLike_twinId_userId_key" ON "TwinLike"("twinId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "TwinFollow_twinId_userId_key" ON "TwinFollow"("twinId", "userId");

-- Add foreign key constraints
ALTER TABLE "TwinLike" DROP CONSTRAINT IF EXISTS "TwinLike_twinId_fkey";
ALTER TABLE "TwinLike" ADD CONSTRAINT "TwinLike_twinId_fkey" FOREIGN KEY ("twinId") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TwinLike" DROP CONSTRAINT IF EXISTS "TwinLike_userId_fkey";
ALTER TABLE "TwinLike" ADD CONSTRAINT "TwinLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TwinFollow" DROP CONSTRAINT IF EXISTS "TwinFollow_twinId_fkey";
ALTER TABLE "TwinFollow" ADD CONSTRAINT "TwinFollow_twinId_fkey" FOREIGN KEY ("twinId") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TwinFollow" DROP CONSTRAINT IF EXISTS "TwinFollow_userId_fkey";
ALTER TABLE "TwinFollow" ADD CONSTRAINT "TwinFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublicChat" DROP CONSTRAINT IF EXISTS "PublicChat_twinId_fkey";
ALTER TABLE "PublicChat" ADD CONSTRAINT "PublicChat_twinId_fkey" FOREIGN KEY ("twinId") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Update existing twins to have default values
UPDATE "Twin" SET 
    "isPublic" = false,
    "verified" = false,
    "likeCount" = 0,
    "followCount" = 0,
    "chatCount" = 0
WHERE "isPublic" IS NULL;

-- Phase 8: Privacy and Moderation Tables

-- Add privacy columns to Twin table
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "allowPublicChat" BOOLEAN DEFAULT true;
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "showChatHistory" BOOLEAN DEFAULT true;
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "allowAnonymousChat" BOOLEAN DEFAULT true;
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "requireLogin" BOOLEAN DEFAULT false;
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "allowLikes" BOOLEAN DEFAULT true;
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "allowFollows" BOOLEAN DEFAULT true;
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "allowShares" BOOLEAN DEFAULT true;
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "moderateMessages" BOOLEAN DEFAULT false;
ALTER TABLE "Twin" ADD COLUMN IF NOT EXISTS "allowDirectMessages" BOOLEAN DEFAULT true;

-- Create TwinBlockedUsers table for privacy controls
CREATE TABLE IF NOT EXISTS "TwinBlockedUsers" (
    "id" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwinBlockedUsers_pkey" PRIMARY KEY ("id")
);

-- Create ContentReport table for content moderation
CREATE TABLE IF NOT EXISTS "ContentReport" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "reporterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

-- Create ModerationSettings table
CREATE TABLE IF NOT EXISTS "ModerationSettings" (
    "id" TEXT NOT NULL,
    "useAIModeration" BOOLEAN DEFAULT true,
    "moderationLevel" TEXT DEFAULT 'basic',
    "spamThreshold" DOUBLE PRECISION DEFAULT 0.7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModerationSettings_pkey" PRIMARY KEY ("id")
);

-- Create indexes for new tables
CREATE UNIQUE INDEX IF NOT EXISTS "TwinBlockedUsers_twinId_userId_key" ON "TwinBlockedUsers"("twinId", "userId");
CREATE INDEX IF NOT EXISTS "ContentReport_contentId_idx" ON "ContentReport"("contentId");
CREATE INDEX IF NOT EXISTS "ContentReport_reporterId_idx" ON "ContentReport"("reporterId");

-- Add foreign key constraints for new tables
ALTER TABLE "TwinBlockedUsers" DROP CONSTRAINT IF EXISTS "TwinBlockedUsers_twinId_fkey";
ALTER TABLE "TwinBlockedUsers" ADD CONSTRAINT "TwinBlockedUsers_twinId_fkey" FOREIGN KEY ("twinId") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TwinBlockedUsers" DROP CONSTRAINT IF EXISTS "TwinBlockedUsers_userId_fkey";
ALTER TABLE "TwinBlockedUsers" ADD CONSTRAINT "TwinBlockedUsers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContentReport" DROP CONSTRAINT IF EXISTS "ContentReport_reporterId_fkey";
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Insert default moderation settings
INSERT INTO "ModerationSettings" ("id", "useAIModeration", "moderationLevel", "spamThreshold")
VALUES ('global', true, 'basic', 0.7)
ON CONFLICT ("id") DO NOTHING;
