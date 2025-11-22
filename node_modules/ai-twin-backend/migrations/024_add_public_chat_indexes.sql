-- Migration: Add Performance Indexes for Public Chat Filtering
-- File: backend/migrations/024_add_public_chat_indexes.sql

-- For user-wise filtering
CREATE INDEX IF NOT EXISTS idx_publicchat_twinid_userid_createdat 
ON "PublicChat" ("twinId", "userId", "createdAt" DESC) 
WHERE "userId" IS NOT NULL;

-- For date range filtering
CREATE INDEX IF NOT EXISTS idx_publicchat_twinid_createdat 
ON "PublicChat" ("twinId", "createdAt" DESC);

-- For lastActivity sorting (most common)
CREATE INDEX IF NOT EXISTS idx_publicchat_twinid_lastactivity 
ON "PublicChat" ("twinId", "lastActivity" DESC NULLS LAST);

-- For message count sorting
CREATE INDEX IF NOT EXISTS idx_publicchat_twinid_messagecount 
ON "PublicChat" ("twinId", "messageCount" DESC);

-- For message content search (GIN index for full-text search)
CREATE INDEX IF NOT EXISTS idx_publicmessage_content_gin 
ON "PublicMessage" USING gin(to_tsvector('english', content));

-- Composite index for chat + message search
CREATE INDEX IF NOT EXISTS idx_publicmessage_chatid_createdat_desc 
ON "PublicMessage" ("chatId", "createdAt" DESC);

-- Migration completed
SELECT 'Public chat performance indexes added successfully!' as status;