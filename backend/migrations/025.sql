-- Migration: Create TwinProfile Table
-- This migration creates a new TwinProfile table to separate profile display from twin functionality
-- TwinProfile will always exist for every user, even if they don't have a twin yet
-- Date: 2024

-- ============================================================================
-- STEP 1: Create TwinProfile Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS "TwinProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "twinId" TEXT,
    "publicHandle" TEXT,
    "bio" TEXT,
    "profileImage" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "followCount" INTEGER NOT NULL DEFAULT 0,
    "chatCount" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "allowShares" BOOLEAN DEFAULT true,
    "allowLikes" BOOLEAN DEFAULT true,
    "allowFollows" BOOLEAN DEFAULT true,
    "requireLogin" BOOLEAN DEFAULT false,
    "blockNonLoggedUsers" BOOLEAN DEFAULT false,
    "showChatHistory" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwinProfile_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- STEP 2: Create Indexes
-- ============================================================================

-- Unique index: One profile per user
CREATE UNIQUE INDEX IF NOT EXISTS "TwinProfile_userId_key" ON "TwinProfile"("userId");

-- Unique index: publicHandle must be unique (only when not NULL)
CREATE UNIQUE INDEX IF NOT EXISTS "TwinProfile_publicHandle_key" ON "TwinProfile"("publicHandle") WHERE "publicHandle" IS NOT NULL;

-- Index for twinId lookups
CREATE INDEX IF NOT EXISTS "TwinProfile_twinId_idx" ON "TwinProfile"("twinId") WHERE "twinId" IS NOT NULL;

-- Index for public profiles
CREATE INDEX IF NOT EXISTS "TwinProfile_isPublic_idx" ON "TwinProfile"("isPublic") WHERE "isPublic" = true;

-- ============================================================================
-- STEP 3: Migrate Existing Data from Twin to TwinProfile
-- ============================================================================

-- For users who already have twins, migrate all profile data
INSERT INTO "TwinProfile" (
    "id",
    "userId",
    "twinId",
    "publicHandle",
    "bio",
    "profileImage",
    "verified",
    "likeCount",
    "followCount",
    "chatCount",
    "isPublic",
    "allowShares",
    "allowLikes",
    "allowFollows",
    "requireLogin",
    "blockNonLoggedUsers",
    "showChatHistory",
    "createdAt",
    "updatedAt"
)
SELECT 
    t.id,
    t."userId",
    t.id as "twinId",
    t."publicHandle",
    t.bio,
    t."profileImage",
    COALESCE(t.verified, false),
    COALESCE(t."likeCount", 0),
    COALESCE(t."followCount", 0),
    COALESCE(t."chatCount", 0),
    COALESCE(t."isPublic", false),
    COALESCE(t."allowShares", true),
    COALESCE(t."allowLikes", true),
    COALESCE(t."allowFollows", true),
    COALESCE(t."requireLogin", false),
    COALESCE(t."blockNonLoggedUsers", false),
    COALESCE(t."showChatHistory", true),
    t."createdAt",
    CURRENT_TIMESTAMP
FROM "Twin" t
WHERE NOT EXISTS (
    SELECT 1 FROM "TwinProfile" tp WHERE tp."userId" = t."userId"
)
ON CONFLICT ("userId") DO NOTHING;

-- ============================================================================
-- STEP 4: Create TwinProfile for Users Without Twins
-- ============================================================================

-- For users without twins, create basic TwinProfile with NULL publicHandle
-- publicHandle will be set later when profile is made public
INSERT INTO "TwinProfile" (
    "id",
    "userId",
    "twinId",
    "publicHandle",
    "isPublic",
    "createdAt",
    "updatedAt"
)
SELECT 
    'twinprofile_' || u.id,
    u.id,
    NULL,
    NULL,  -- publicHandle is NULL initially, will be set when made public
    false,
    u."createdAt",
    CURRENT_TIMESTAMP
FROM "User" u
WHERE NOT EXISTS (
    SELECT 1 FROM "TwinProfile" tp WHERE tp."userId" = u.id
)
ON CONFLICT ("userId") DO NOTHING;

-- ============================================================================
-- STEP 5: Add Foreign Key Constraints
-- ============================================================================

-- Link TwinProfile to User
ALTER TABLE "TwinProfile" DROP CONSTRAINT IF EXISTS "TwinProfile_userId_fkey";
ALTER TABLE "TwinProfile" ADD CONSTRAINT "TwinProfile_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Link TwinProfile to Twin (nullable - only when twin exists)
ALTER TABLE "TwinProfile" DROP CONSTRAINT IF EXISTS "TwinProfile_twinId_fkey";
ALTER TABLE "TwinProfile" ADD CONSTRAINT "TwinProfile_twinId_fkey" 
    FOREIGN KEY ("twinId") REFERENCES "Twin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- STEP 6: Update Foreign Key References
-- ============================================================================
-- Note: We will update TwinLike, TwinFollow, PublicChat, TwinBlockedUsers
-- to reference TwinProfile instead of Twin. But we'll do this in a separate step
-- after code is updated, to avoid breaking existing functionality.

-- For now, we'll keep the existing foreign keys pointing to Twin.
-- When code is updated, we'll run the following:

/*
-- Update TwinLike to reference TwinProfile
UPDATE "TwinLike" tl
SET "twinId" = tp.id
FROM "TwinProfile" tp
WHERE tp."twinId" = tl."twinId"::text
AND tp."twinId" IS NOT NULL;

-- Update TwinFollow to reference TwinProfile
UPDATE "TwinFollow" tf
SET "twinId" = tp.id
FROM "TwinProfile" tp
WHERE tp."twinId" = tf."twinId"::text
AND tp."twinId" IS NOT NULL;

-- Update PublicChat to reference TwinProfile
UPDATE "PublicChat" pc
SET "twinId" = tp.id
FROM "TwinProfile" tp
WHERE tp."twinId" = pc."twinId"::text
AND tp."twinId" IS NOT NULL;

-- Update TwinBlockedUsers to reference TwinProfile
UPDATE "TwinBlockedUsers" tbu
SET "twinId" = tp.id
FROM "TwinProfile" tp
WHERE tp."twinId" = tbu."twinId"::text
AND tp."twinId" IS NOT NULL;

-- Then update foreign key constraints:
ALTER TABLE "TwinLike" DROP CONSTRAINT IF EXISTS "TwinLike_twinId_fkey";
ALTER TABLE "TwinLike" ADD CONSTRAINT "TwinLike_twinId_fkey" 
    FOREIGN KEY ("twinId") REFERENCES "TwinProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TwinFollow" DROP CONSTRAINT IF EXISTS "TwinFollow_twinId_fkey";
ALTER TABLE "TwinFollow" ADD CONSTRAINT "TwinFollow_twinId_fkey" 
    FOREIGN KEY ("twinId") REFERENCES "TwinProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublicChat" DROP CONSTRAINT IF EXISTS "PublicChat_twinId_fkey";
ALTER TABLE "PublicChat" ADD CONSTRAINT "PublicChat_twinId_fkey" 
    FOREIGN KEY ("twinId") REFERENCES "TwinProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TwinBlockedUsers" DROP CONSTRAINT IF EXISTS "TwinBlockedUsers_twinId_fkey";
ALTER TABLE "TwinBlockedUsers" ADD CONSTRAINT "TwinBlockedUsers_twinId_fkey" 
    FOREIGN KEY ("twinId") REFERENCES "TwinProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
*/

-- ============================================================================
-- STEP 7: Verification Queries (Optional - Run to verify migration)
-- ============================================================================

-- Check if all users have TwinProfile
-- SELECT 
--     COUNT(DISTINCT u.id) as total_users,
--     COUNT(DISTINCT tp."userId") as users_with_profile,
--     COUNT(DISTINCT t."userId") as users_with_twin
-- FROM "User" u
-- LEFT JOIN "TwinProfile" tp ON u.id = tp."userId"
-- LEFT JOIN "Twin" t ON u.id = t."userId";

-- Check profiles without twins
-- SELECT COUNT(*) as profiles_without_twin
-- FROM "TwinProfile"
-- WHERE "twinId" IS NULL;

-- Check profiles with twins
-- SELECT COUNT(*) as profiles_with_twin
-- FROM "TwinProfile"
-- WHERE "twinId" IS NOT NULL;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================