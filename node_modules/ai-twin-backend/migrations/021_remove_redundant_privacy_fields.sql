-- Migration: Remove Redundant Privacy Fields
-- Removes allowPublicChat, allowAnonymousChat, moderateMessages, allowDirectMessages
-- These are redundant with isPublic, requireLogin, and requireApproval

-- Remove redundant columns from Twin table
ALTER TABLE "Twin" DROP COLUMN IF EXISTS "allowPublicChat";
ALTER TABLE "Twin" DROP COLUMN IF EXISTS "allowAnonymousChat";
ALTER TABLE "Twin" DROP COLUMN IF EXISTS "moderateMessages";
ALTER TABLE "Twin" DROP COLUMN IF EXISTS "allowDirectMessages";

SELECT 'Redundant privacy fields removed successfully!' as status;