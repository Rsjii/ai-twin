-- Migration: Add Analytics Performance Indexes
-- File: backend/migrations/019_analytics_performance_indexes.sql
-- Purpose: Optimize admin analytics queries that scan Event/Message/Chat tables

-- ⚡ CRITICAL: Event table indexes (most queries scan this)
-- Index for time-based filters (used in ALL time period queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Event_createdAt_idx" 
ON "Event"("createdAt");

-- Composite index for user activity queries (DAU/WAU/MAU, retention)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Event_userId_createdAt_idx" 
ON "Event"("userId", "createdAt");

-- Composite index for event type + time filters (activation, virality)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Event_type_createdAt_idx" 
ON "Event"(type, "createdAt");

-- Index for event type lookups (event breakdown)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Event_type_idx" 
ON "Event"(type);

-- ⚡ CRITICAL: Message table indexes
-- Index for time-based message counts
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_createdAt_idx" 
ON "Message"("createdAt");

-- Composite index for chat message queries (already have chatId, but add createdAt for time filters)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_chatId_createdAt_idx" 
ON "Message"("chatId", "createdAt");

-- ⚡ CRITICAL: Chat table indexes
-- Index for time-based chat counts
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Chat_createdAt_idx" 
ON "Chat"("createdAt");

-- Index for user chat queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Chat_userId_createdAt_idx" 
ON "Chat"("userId", "createdAt");

-- Index for twin chat queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Chat_twinId_createdAt_idx" 
ON "Chat"("twinId", "createdAt");

-- ⚡ OPTIONAL: Invite table indexes (for virality metrics)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invite_createdAt_idx" 
ON "Invite"("createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invite_inviterId_createdAt_idx" 
ON "Invite"("inviterId", "createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invite_acceptedBy_createdAt_idx" 
ON "Invite"("acceptedBy", "createdAt");

-- Migration completed
SELECT 'Analytics performance indexes added successfully!' as status;
