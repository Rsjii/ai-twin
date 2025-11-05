-- Migration: Add Performance Indexes for Critical Queries
-- File: backend/migrations/018_add_performance_indexes.sql
-- This migration adds indexes to optimize frequently used queries

-- 1. Discover page optimization (CRITICAL - most used endpoint)
-- Composite index for isPublic + engagement sorting
CREATE INDEX IF NOT EXISTS idx_twin_ispublic_engagement 
ON "Twin" ("isPublic", "likeCount" DESC, "followCount" DESC, "chatCount" DESC) 
WHERE "isPublic" = true;

-- Index for TwinPerformance join (faster discover queries)
CREATE INDEX IF NOT EXISTS idx_twin_performance_twinid_engagement 
ON "TwinPerformance" ("twinId", "engagementScore" DESC);

-- 2. Memory retrieval optimization (CRITICAL - called every message)
-- Composite index for twinId + key lookup (faster than ILIKE)
CREATE INDEX IF NOT EXISTS idx_memory_longterm_twinid_key_updatedat 
ON "MemoryLongTerm" ("twinId", key, "updatedAt" DESC);

-- Partial index for category filtering
CREATE INDEX IF NOT EXISTS idx_memory_longterm_twinid_category 
ON "MemoryLongTerm" ("twinId", category) 
WHERE category IS NOT NULL;

-- 3. Message queries (faster chat history retrieval)
CREATE INDEX IF NOT EXISTS idx_message_chatid_sender_createdat 
ON "Message" ("chatId", sender, "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_publicmessage_chatid_sender_createdat 
ON "PublicMessage" ("chatId", sender, "createdAt" DESC);

-- 4. Chat queries optimization
CREATE INDEX IF NOT EXISTS idx_chat_userid_twinid_createdat 
ON "Chat" ("userId", "twinId", "createdAt" DESC);

-- 5. Session memory optimization
CREATE INDEX IF NOT EXISTS idx_memory_session_chatid_lastupdated 
ON "MemorySession" ("chatId", "lastUpdated" DESC);

-- 6. Style anchors optimization (already have twin_id, but add composite for better sorting)
CREATE INDEX IF NOT EXISTS idx_style_anchors_twinid_type_createdat 
ON "style_anchors" (twin_id, type, created_at DESC);

-- Migration completed
SELECT 'Performance indexes added successfully!' as status;

