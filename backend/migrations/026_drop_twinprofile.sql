-- Migration: Drop TwinProfile Table
-- This migration removes the TwinProfile table and consolidates everything back to Twin table
-- Date: 2024

-- ============================================================================
-- STEP 1: (Optional) Copy any data from TwinProfile back into Twin where useful
-- ============================================================================

UPDATE "Twin" t
SET
  "isPublic"     = COALESCE(tp."isPublic", t."isPublic"),
  "bio"          = COALESCE(tp."bio", t."bio"),
  "profileImage" = COALESCE(tp."profileImage", t."profileImage"),
  "likeCount"    = COALESCE(tp."likeCount", t."likeCount"),
  "followCount"  = COALESCE(tp."followCount", t."followCount"),
  "chatCount"    = COALESCE(tp."chatCount", t."chatCount")
FROM "TwinProfile" tp
WHERE tp."twinId" = t.id;

-- ============================================================================
-- STEP 2: Migrate privacy flags from TwinProfile to Twin
-- ============================================================================

UPDATE "Twin" t
SET
  "requireLogin"       = COALESCE(tp."requireLogin", t."requireLogin"),
  "blockNonLoggedUsers"= COALESCE(tp."blockNonLoggedUsers", t."blockNonLoggedUsers"),
  "allowLikes"         = COALESCE(tp."allowLikes", t."allowLikes"),
  "allowFollows"       = COALESCE(tp."allowFollows", t."allowFollows"),
  "allowShares"        = COALESCE(tp."allowShares", t."allowShares"),
  "showChatHistory"    = COALESCE(tp."showChatHistory", t."showChatHistory")
FROM "TwinProfile" tp
WHERE tp."twinId" = t.id;

-- ============================================================================
-- STEP 3: Drop TwinProfile table & related indexes
-- ============================================================================

DROP TABLE IF EXISTS "TwinProfile" CASCADE;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

