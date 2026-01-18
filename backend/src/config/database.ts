import { db } from './db';
import { logger } from './logger';
import { verifyTwinOwnership } from '../utils/twinUtils';
import { generateId as generateBackendId } from '../utils/idGenerator';

// SQL to create all tables
const createTablesSQL = `
-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "MessageSender" AS ENUM ('human', 'twin', 'none');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "mem_bucket" AS ENUM ('facts', 'voice');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ✅ FIX: Create pg_trgm extension if it doesn't exist (required for gin_trgm_ops)
DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION
    WHEN OTHERS THEN
        -- Extension might not be available, continue without it
        NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "googleEmail" TEXT,
    "googleEmailVerified" BOOLEAN,
    "handle" TEXT,
    "name" TEXT,
    "dob" DATE,
    "phone" TEXT,
    "bio" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "referralCode" TEXT,
    "personaData" JSONB,
    "onboardingCompleted" BOOLEAN DEFAULT false,
    "usernameLastChanged" TIMESTAMP,
    "usernameChangeCount" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHandleChangeAt" TIMESTAMPTZ NULL,
    "profileCompleted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Twin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "styleVector" JSONB NOT NULL,
    "sampleReply" TEXT,
    "instructions" JSONB,
    "isPublic" BOOLEAN DEFAULT false,
    "publicHandle" TEXT,
    "bio" TEXT,
    "profileImage" TEXT,
    "verified" BOOLEAN DEFAULT false,
    "likeCount" INTEGER DEFAULT 0,
    "followCount" INTEGER DEFAULT 0,
    "chatCount" INTEGER DEFAULT 0,
    "tier" VARCHAR(20) DEFAULT 'free',
    "showChatHistory" BOOLEAN DEFAULT true,
    "requireLogin" BOOLEAN DEFAULT false,
    "allowLikes" BOOLEAN DEFAULT true,
    "allowFollows" BOOLEAN DEFAULT true,
    "allowShares" BOOLEAN DEFAULT true,
    "personaData" JSONB,
    "systemPrompt" TEXT,
    "tokenLimit" INTEGER DEFAULT 500,
    "last_updated" TIMESTAMPTZ DEFAULT now(),
    "style_version" INTEGER DEFAULT 1,
    "requireApproval" BOOLEAN DEFAULT false,
    "blockNonLoggedUsers" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) DEFAULT now(),
    CONSTRAINT "Twin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Chat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "chatVector" JSONB,
    "updatedAt" TIMESTAMPTZ(3) DEFAULT now(),
    "title" TEXT,
    "summary" TEXT,
    "lastMessage" TEXT,
    "messageCount" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "content" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "requestId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OTP" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'generic',
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "OTP_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Invite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "inviterId" TEXT,
    "acceptedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Event" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TwinLike" (
    "id" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwinLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TwinFollow" (
    "id" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwinFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TwinBlockedUsers" (
    "id" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwinBlockedUsers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PublicChat" (
    "id" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "visitorId" TEXT,
    "userId" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "summary" TEXT,
    "lastMessage" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivity" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PublicMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "content" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "requestId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AILearning" (
    "id" SERIAL NOT NULL,
    "twinId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "learningData" JSONB,
    "lastUpdated" TIMESTAMP DEFAULT now(),
    CONSTRAINT "AILearning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChatFeedback" (
    "id" SERIAL NOT NULL,
    "chatId" VARCHAR(255) NOT NULL,
    "responseId" VARCHAR(255) NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" VARCHAR(20) NOT NULL,
    "suggestion" TEXT,
    "tonePreference" VARCHAR(50),
    "createdAt" TIMESTAMP DEFAULT now(),
    CONSTRAINT "ChatFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ContactSubmission" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "ContactSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ContentReport" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "reporterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MemoryLongTerm" (
    "id" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT,
    "embedding" JSONB,
    "confidence" DOUBLE PRECISION DEFAULT 1.0,
    "source" TEXT,
    "updatedAt" TIMESTAMPTZ DEFAULT now(),
    "createdAt" TIMESTAMPTZ DEFAULT now(),
    "visibility" TEXT NOT NULL DEFAULT 'owner',
    CONSTRAINT "MemoryLongTerm_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MemoryLongTerm_visibility_check" CHECK (visibility = ANY (ARRAY['owner'::text, 'public_twin'::text]))
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MemorySession" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "vector" JSONB,
    "keyTopics" TEXT[],
    "messageCount" INTEGER DEFAULT 0,
    "lastUpdated" TIMESTAMPTZ DEFAULT now(),
    "createdAt" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT "MemorySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MemorySessionPublic" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "vector" JSONB,
    "keyTopics" TEXT[],
    "messageCount" INTEGER DEFAULT 0,
    "lastUpdated" TIMESTAMPTZ DEFAULT now(),
    "createdAt" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT "MemorySessionPublic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ModerationSettings" (
    "id" TEXT NOT NULL,
    "useAIModeration" BOOLEAN DEFAULT true,
    "moderationLevel" TEXT DEFAULT 'basic',
    "spamThreshold" DOUBLE PRECISION DEFAULT 0.7,
    "requireApproval" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModerationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TokenUsageDaily" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "actorKey" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "userId" TEXT,
    "visitorId" TEXT,
    "ipHash" TEXT,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "TokenUsageDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TwinPerformance" (
    "id" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "engagementScore" DOUBLE PRECISION DEFAULT 0,
    "popularityScore" DOUBLE PRECISION DEFAULT 0,
    "updatedAt" TIMESTAMPTZ DEFAULT now(),
    "createdAt" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT "TwinPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ai_runs" (
    "id" TEXT NOT NULL,
    "twin_id" TEXT NOT NULL,
    "mode" TEXT,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "critic_score" INTEGER,
    "regen" BOOLEAN NOT NULL DEFAULT false,
    "latency_ms" INTEGER,
    "ts" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "feedback_score" INTEGER,
    "user_rating" TEXT,
    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "mem_chunks" (
    "id" TEXT NOT NULL,
    "twin_id" TEXT NOT NULL,
    "bucket" "mem_bucket" NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" JSONB,
    "ts" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "is_public" BOOLEAN DEFAULT false,
    CONSTRAINT "mem_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "reset_time" BIGINT NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "window_ms" BIGINT NOT NULL,
    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "session" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "style_anchors" (
    "id" TEXT NOT NULL,
    "twin_id" TEXT NOT NULL,
    "user_utterance" TEXT NOT NULL,
    "ideal_reply" TEXT NOT NULL,
    "tags" TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "type" TEXT DEFAULT 'interaction',
    "phrase" TEXT,
    "pattern_type" TEXT,
    "context" TEXT,
    CONSTRAINT "style_anchors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "style_anchors_type_check" CHECK (type = ANY (ARRAY['interaction'::text, 'phrase'::text, 'pattern'::text]))
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "style_corrections" (
    "id" TEXT NOT NULL,
    "twin_id" TEXT NOT NULL,
    "knob" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "source" TEXT,
    "ts" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "style_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_handle_key" ON "User"("handle");
CREATE INDEX IF NOT EXISTS "User_referralCode_idx" ON "User"("referralCode");
-- ✅ Removed: User_referralCode_key index (created as constraint in DO block below)
CREATE INDEX IF NOT EXISTS "idx_user_onboarding_completed" ON "User"("onboardingCompleted");
-- ✅ googleId and OTP purpose indexes are created in DO $$ block AFTER columns are added
CREATE UNIQUE INDEX IF NOT EXISTS "Invite_code_key" ON "Invite"("code");
CREATE INDEX IF NOT EXISTS "Invite_acceptedBy_createdAt_idx" ON "Invite"("acceptedBy", "createdAt");
CREATE INDEX IF NOT EXISTS "Invite_createdAt_idx" ON "Invite"("createdAt");
CREATE INDEX IF NOT EXISTS "Invite_inviterId_createdAt_idx" ON "Invite"("inviterId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Twin_userId_key" ON "Twin"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Twin_publicHandle_key" ON "Twin"("publicHandle");
CREATE INDEX IF NOT EXISTS "idx_twin_block_non_logged" ON "Twin"("blockNonLoggedUsers", "isPublic") WHERE ("isPublic" = true);
CREATE INDEX IF NOT EXISTS "idx_twin_ispublic_engagement" ON "Twin"("isPublic", "likeCount" DESC, "followCount" DESC, "chatCount" DESC) WHERE ("isPublic" = true);
CREATE INDEX IF NOT EXISTS "idx_twin_last_updated" ON "Twin"("last_updated");
CREATE INDEX IF NOT EXISTS "idx_twin_tier" ON "Twin"("tier");
CREATE INDEX IF NOT EXISTS "Chat_createdAt_idx" ON "Chat"("createdAt");
CREATE INDEX IF NOT EXISTS "Chat_twinId_createdAt_idx" ON "Chat"("twinId", "createdAt");
CREATE INDEX IF NOT EXISTS "Chat_userId_createdAt_idx" ON "Chat"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_chat_chatvector" ON "Chat"("chatVector");
CREATE INDEX IF NOT EXISTS "idx_chat_twinid" ON "Chat"("twinId");
CREATE INDEX IF NOT EXISTS "idx_chat_userid_createdat" ON "Chat"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_chat_userid_twinid_createdat" ON "Chat"("userId", "twinId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Message_chatId_createdAt_idx" ON "Message"("chatId", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_createdAt_idx" ON "Message"("createdAt");
CREATE INDEX IF NOT EXISTS "idx_message_chatid_createdat" ON "Message"("chatId", "createdAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_message_chatid_requestid_unique" ON "Message"("chatId", "requestId");
CREATE INDEX IF NOT EXISTS "idx_message_chatid_sender_createdat" ON "Message"("chatId", "sender", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Event_createdAt_idx" ON "Event"("createdAt");
CREATE INDEX IF NOT EXISTS "Event_type_createdAt_idx" ON "Event"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "Event_type_idx" ON "Event"("type");
CREATE INDEX IF NOT EXISTS "Event_userId_createdAt_idx" ON "Event"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Event_userId_type_createdAt_idx" ON "Event"("userId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "Event_meta_publicChatId_idx" ON "Event" USING btree (((meta ->> 'publicChatId'::text)));
CREATE INDEX IF NOT EXISTS "Event_meta_viewerId_idx" ON "Event" USING btree (((meta ->> 'viewerId'::text)));
CREATE UNIQUE INDEX IF NOT EXISTS "TwinLike_twinId_userId_key" ON "TwinLike"("twinId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "TwinFollow_twinId_userId_key" ON "TwinFollow"("twinId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "TwinBlockedUsers_twinId_userId_key" ON "TwinBlockedUsers"("twinId", "userId");
CREATE INDEX IF NOT EXISTS "TwinBlockedUsers_userId_idx" ON "TwinBlockedUsers"("userId");
CREATE INDEX IF NOT EXISTS "TwinBlockedUsers_twinId_idx" ON "TwinBlockedUsers"("twinId");
CREATE INDEX IF NOT EXISTS "idx_publicchat_twinid_createdat" ON "PublicChat"("twinId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_publicchat_twinid_lastactivity" ON "PublicChat"("twinId", "lastActivity" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "idx_publicchat_twinid_messagecount" ON "PublicChat"("twinId", "messageCount" DESC);
CREATE INDEX IF NOT EXISTS "idx_publicchat_twinid_userid_createdat" ON "PublicChat"("twinId", "userId", "createdAt" DESC) WHERE ("userId" IS NOT NULL);
CREATE INDEX IF NOT EXISTS "idx_publicchat_twinid_visitorid" ON "PublicChat"("twinId", "visitorId");
CREATE INDEX IF NOT EXISTS "idx_publicchat_userid" ON "PublicChat"("userId");
CREATE INDEX IF NOT EXISTS "idx_publicchat_userid_twinid" ON "PublicChat"("twinId", "userId");
CREATE INDEX IF NOT EXISTS "idx_publicchat_visitorid" ON "PublicChat"("visitorId");
CREATE INDEX IF NOT EXISTS "idx_publicmessage_chatid_createdat" ON "PublicMessage"("chatId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_publicmessage_chatid_createdat_desc" ON "PublicMessage"("chatId", "createdAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_publicmessage_chatid_requestid_unique" ON "PublicMessage"("chatId", "requestId");
CREATE INDEX IF NOT EXISTS "idx_publicmessage_chatid_sender_createdat" ON "PublicMessage"("chatId", "sender", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_publicmessage_content_gin" ON "PublicMessage" USING gin (to_tsvector('english'::regconfig, content));
CREATE INDEX IF NOT EXISTS "idx_publicmessage_sender" ON "PublicMessage"("sender");
CREATE UNIQUE INDEX IF NOT EXISTS "AILearning_twinId_key" ON "AILearning"("twinId");
CREATE UNIQUE INDEX IF NOT EXISTS "ChatFeedback_chatId_responseId_userId_key" ON "ChatFeedback"("chatId", "responseId", "userId");
CREATE INDEX IF NOT EXISTS "ContactSubmission_createdAt_idx" ON "ContactSubmission"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ContactSubmission_email_idx" ON "ContactSubmission"("email");
CREATE INDEX IF NOT EXISTS "ContentReport_contentId_idx" ON "ContentReport"("contentId");
CREATE INDEX IF NOT EXISTS "ContentReport_reporterId_idx" ON "ContentReport"("reporterId");
CREATE INDEX IF NOT EXISTS "idx_memory_longterm_category" ON "MemoryLongTerm"("category");
CREATE INDEX IF NOT EXISTS "idx_memory_longterm_key" ON "MemoryLongTerm"("key");
CREATE INDEX IF NOT EXISTS "idx_memory_longterm_twinid" ON "MemoryLongTerm"("twinId");
CREATE INDEX IF NOT EXISTS "idx_memory_longterm_twinid_category" ON "MemoryLongTerm"("twinId", "category") WHERE (category IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_memory_longterm_twinid_key" ON "MemoryLongTerm"("twinId", "key");
CREATE INDEX IF NOT EXISTS "idx_memory_longterm_twinid_key_updatedat" ON "MemoryLongTerm"("twinId", "key", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_memory_longterm_twinid_visibility_updatedat" ON "MemoryLongTerm"("twinId", "visibility", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_memory_longterm_updatedat" ON "MemoryLongTerm"("updatedAt");
CREATE INDEX IF NOT EXISTS "idx_memory_session_chatid_lastupdated" ON "MemorySession"("chatId", "lastUpdated" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_memory_session_chatid_unique" ON "MemorySession"("chatId");
CREATE INDEX IF NOT EXISTS "idx_memory_session_lastupdated" ON "MemorySession"("lastUpdated");
CREATE INDEX IF NOT EXISTS "idx_memory_session_public_chatid" ON "MemorySessionPublic"("chatId");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_memory_session_public_chatid_unique" ON "MemorySessionPublic"("chatId");
CREATE INDEX IF NOT EXISTS "idx_memory_session_public_lastupdated" ON "MemorySessionPublic"("lastUpdated");
CREATE INDEX IF NOT EXISTS "idx_moderation_settings_requireapproval" ON "ModerationSettings"("requireApproval");
CREATE UNIQUE INDEX IF NOT EXISTS "TokenUsageDaily_day_actorKey_key" ON "TokenUsageDaily"("day", "actorKey");
CREATE INDEX IF NOT EXISTS "TokenUsageDaily_day_actorType_idx" ON "TokenUsageDaily"("day", "actorType");
CREATE INDEX IF NOT EXISTS "TokenUsageDaily_day_userId_idx" ON "TokenUsageDaily"("day", "userId");
CREATE INDEX IF NOT EXISTS "idx_twin_performance_engagement" ON "TwinPerformance"("engagementScore" DESC);
CREATE INDEX IF NOT EXISTS "idx_twin_performance_popularity" ON "TwinPerformance"("popularityScore" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_twin_performance_twinid" ON "TwinPerformance"("twinId");
CREATE INDEX IF NOT EXISTS "idx_twin_performance_twinid_engagement" ON "TwinPerformance"("twinId", "engagementScore" DESC);
CREATE INDEX IF NOT EXISTS "idx_ai_runs_critic_score" ON "ai_runs"("critic_score");
CREATE INDEX IF NOT EXISTS "idx_ai_runs_mode" ON "ai_runs"("mode");
CREATE INDEX IF NOT EXISTS "idx_ai_runs_ts" ON "ai_runs"("ts");
CREATE INDEX IF NOT EXISTS "idx_ai_runs_twin_id" ON "ai_runs"("twin_id");
CREATE INDEX IF NOT EXISTS "idx_mem_chunks_bucket" ON "mem_chunks"("bucket");
CREATE INDEX IF NOT EXISTS "idx_mem_chunks_public" ON "mem_chunks"("is_public");
CREATE INDEX IF NOT EXISTS "idx_mem_chunks_ts" ON "mem_chunks"("ts");
CREATE INDEX IF NOT EXISTS "idx_mem_chunks_twin_id" ON "mem_chunks"("twin_id");
CREATE INDEX IF NOT EXISTS "idx_rate_limits_reset_time" ON "rate_limits"("reset_time");
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session"("expire");
CREATE INDEX IF NOT EXISTS "idx_style_anchors_created_at" ON "style_anchors"("created_at");
CREATE INDEX IF NOT EXISTS "idx_style_anchors_twin_id" ON "style_anchors"("twin_id");
CREATE INDEX IF NOT EXISTS "idx_style_anchors_twinid_type" ON "style_anchors"("twin_id", "type");
CREATE INDEX IF NOT EXISTS "idx_style_anchors_twinid_type_createdat" ON "style_anchors"("twin_id", "type", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_style_anchors_type" ON "style_anchors"("type");
-- ✅ FIX: Create trigram index only if extension is available
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        CREATE INDEX IF NOT EXISTS "idx_style_anchors_user_utterance_trgm" 
        ON "style_anchors" USING gin (user_utterance gin_trgm_ops);
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- If extension doesn't exist or index creation fails, skip it
        NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "style_anchors_twin_id_user_utterance_key" ON "style_anchors"("twin_id", "user_utterance");
CREATE INDEX IF NOT EXISTS "idx_style_corrections_knob" ON "style_corrections"("knob");
CREATE INDEX IF NOT EXISTS "idx_style_corrections_ts" ON "style_corrections"("ts");
CREATE INDEX IF NOT EXISTS "idx_style_corrections_twin_id" ON "style_corrections"("twin_id");

-- Add missing columns to User table if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'dob') THEN
        ALTER TABLE "User" ADD COLUMN "dob" DATE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'phone') THEN
        ALTER TABLE "User" ADD COLUMN "phone" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'bio') THEN
        ALTER TABLE "User" ADD COLUMN "bio" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'profileImage') THEN
        ALTER TABLE "User" ADD COLUMN "profileImage" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'instructions') THEN
        ALTER TABLE "Twin" ADD COLUMN "instructions" JSONB;
    END IF;
    
    -- Add new public twin columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'isPublic') THEN
        ALTER TABLE "Twin" ADD COLUMN "isPublic" BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'publicHandle') THEN
        ALTER TABLE "Twin" ADD COLUMN "publicHandle" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'bio') THEN
        ALTER TABLE "Twin" ADD COLUMN "bio" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'profileImage') THEN
        ALTER TABLE "Twin" ADD COLUMN "profileImage" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'verified') THEN
        ALTER TABLE "Twin" ADD COLUMN "verified" BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'likeCount') THEN
        ALTER TABLE "Twin" ADD COLUMN "likeCount" INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'followCount') THEN
        ALTER TABLE "Twin" ADD COLUMN "followCount" INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'chatCount') THEN
        ALTER TABLE "Twin" ADD COLUMN "chatCount" INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'referralCode') THEN
        ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;
    END IF;
    
    -- Fix referralCode: create non-unique index first, then unique constraint
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'User' AND indexname = 'User_referralCode_idx') THEN
        CREATE INDEX "User_referralCode_idx" ON "User"("referralCode");
    END IF;
    
    -- ✅ FIX: Safe constraint addition - check both constraint and index/table
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_referralCode_key')
       AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'User_referralCode_key') THEN
        BEGIN
            ALTER TABLE "User" ADD CONSTRAINT "User_referralCode_key" UNIQUE ("referralCode");
        EXCEPTION
            WHEN duplicate_table OR duplicate_object THEN
                NULL;
        END;
    END IF;

    -- Add missing User columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'onboardingCompleted') THEN
        ALTER TABLE "User" ADD COLUMN "onboardingCompleted" BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'usernameLastChanged') THEN
        ALTER TABLE "User" ADD COLUMN "usernameLastChanged" TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'usernameChangeCount') THEN
        ALTER TABLE "User" ADD COLUMN "usernameChangeCount" INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'User' AND indexname = 'idx_user_onboarding_completed') THEN
        CREATE INDEX "idx_user_onboarding_completed" ON "User"("onboardingCompleted");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'lastHandleChangeAt') THEN
        ALTER TABLE "User" ADD COLUMN "lastHandleChangeAt" TIMESTAMPTZ NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'profileCompleted') THEN
        ALTER TABLE "User" ADD COLUMN "profileCompleted" BOOLEAN NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'personaData') THEN
        ALTER TABLE "User" ADD COLUMN "personaData" JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'googleId') THEN
        ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'googleEmail') THEN
        ALTER TABLE "User" ADD COLUMN "googleEmail" TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'googleEmailVerified') THEN
        ALTER TABLE "User" ADD COLUMN "googleEmailVerified" BOOLEAN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'User' AND indexname = 'User_googleId_key') THEN
        CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'updatedAt') THEN
        ALTER TABLE "User" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'updatedAt') THEN
        ALTER TABLE "Twin" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'tier') THEN
        ALTER TABLE "Twin" ADD COLUMN "tier" VARCHAR(20) DEFAULT 'free';
    END IF;
    
    -- Fix Twin column types: make nullable
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'isPublic' AND is_nullable = 'NO') THEN
        ALTER TABLE "Twin" ALTER COLUMN "isPublic" DROP NOT NULL;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'verified' AND is_nullable = 'NO') THEN
        ALTER TABLE "Twin" ALTER COLUMN "verified" DROP NOT NULL;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'likeCount' AND is_nullable = 'NO') THEN
        ALTER TABLE "Twin" ALTER COLUMN "likeCount" DROP NOT NULL;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'followCount' AND is_nullable = 'NO') THEN
        ALTER TABLE "Twin" ALTER COLUMN "followCount" DROP NOT NULL;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'chatCount' AND is_nullable = 'NO') THEN
        ALTER TABLE "Twin" ALTER COLUMN "chatCount" DROP NOT NULL;
    END IF;
    
    -- Add missing Twin columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'showChatHistory') THEN
        ALTER TABLE "Twin" ADD COLUMN "showChatHistory" BOOLEAN DEFAULT true;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'requireLogin') THEN
        ALTER TABLE "Twin" ADD COLUMN "requireLogin" BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'allowLikes') THEN
        ALTER TABLE "Twin" ADD COLUMN "allowLikes" BOOLEAN DEFAULT true;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'allowFollows') THEN
        ALTER TABLE "Twin" ADD COLUMN "allowFollows" BOOLEAN DEFAULT true;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'allowShares') THEN
        ALTER TABLE "Twin" ADD COLUMN "allowShares" BOOLEAN DEFAULT true;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'personaData') THEN
        ALTER TABLE "Twin" ADD COLUMN "personaData" JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'systemPrompt') THEN
        ALTER TABLE "Twin" ADD COLUMN "systemPrompt" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'tokenLimit') THEN
        ALTER TABLE "Twin" ADD COLUMN "tokenLimit" INTEGER DEFAULT 500;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'last_updated') THEN
        ALTER TABLE "Twin" ADD COLUMN "last_updated" TIMESTAMPTZ DEFAULT now();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'style_version') THEN
        ALTER TABLE "Twin" ADD COLUMN "style_version" INTEGER DEFAULT 1;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'requireApproval') THEN
        ALTER TABLE "Twin" ADD COLUMN "requireApproval" BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'blockNonLoggedUsers') THEN
        ALTER TABLE "Twin" ADD COLUMN "blockNonLoggedUsers" BOOLEAN DEFAULT false;
    END IF;
    
    -- Add missing Chat columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Chat' AND column_name = 'chatVector') THEN
        ALTER TABLE "Chat" ADD COLUMN "chatVector" JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Chat' AND column_name = 'updatedAt') THEN
        ALTER TABLE "Chat" ADD COLUMN "updatedAt" TIMESTAMPTZ DEFAULT now();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Chat' AND column_name = 'title') THEN
        ALTER TABLE "Chat" ADD COLUMN "title" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Chat' AND column_name = 'summary') THEN
        ALTER TABLE "Chat" ADD COLUMN "summary" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Chat' AND column_name = 'lastMessage') THEN
        ALTER TABLE "Chat" ADD COLUMN "lastMessage" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Chat' AND column_name = 'messageCount') THEN
        ALTER TABLE "Chat" ADD COLUMN "messageCount" INTEGER DEFAULT 0;
    END IF;
    
    -- Add missing Message columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Message' AND column_name = 'requestId') THEN
        ALTER TABLE "Message" ADD COLUMN "requestId" TEXT;
    END IF;
    
    -- Add missing PublicChat columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PublicChat' AND column_name = 'title') THEN
        ALTER TABLE "PublicChat" ADD COLUMN "title" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PublicChat' AND column_name = 'summary') THEN
        ALTER TABLE "PublicChat" ADD COLUMN "summary" TEXT;
    END IF;
    
    -- Add missing PublicMessage columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PublicMessage' AND column_name = 'requestId') THEN
        ALTER TABLE "PublicMessage" ADD COLUMN "requestId" TEXT;
    END IF;

    -- ✅ Add purpose column to OTP table for better security
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'OTP' AND column_name = 'purpose') THEN
        ALTER TABLE "OTP" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'generic';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'OTP' AND indexname = 'OTP_email_purpose_idx') THEN
        CREATE INDEX "OTP_email_purpose_idx" ON "OTP"("email", "purpose");
    END IF;
END $$;

-- AddForeignKey
ALTER TABLE "Twin" DROP CONSTRAINT IF EXISTS "Twin_userId_fkey";
ALTER TABLE "Twin" ADD CONSTRAINT "Twin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Chat" DROP CONSTRAINT IF EXISTS "Chat_userId_fkey";
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Chat" DROP CONSTRAINT IF EXISTS "Chat_twinId_fkey";
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_twinId_fkey" FOREIGN KEY ("twinId") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_chatId_fkey";
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invite" DROP CONSTRAINT IF EXISTS "Invite_inviterId_fkey";
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invite" DROP CONSTRAINT IF EXISTS "Invite_acceptedBy_fkey";
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_acceptedBy_fkey" FOREIGN KEY ("acceptedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Event" DROP CONSTRAINT IF EXISTS "Event_userId_fkey";
ALTER TABLE "Event" ADD CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TwinLike" DROP CONSTRAINT IF EXISTS "TwinLike_twinId_fkey";
ALTER TABLE "TwinLike" ADD CONSTRAINT "TwinLike_twinId_fkey" FOREIGN KEY ("twinId") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TwinLike" DROP CONSTRAINT IF EXISTS "TwinLike_userId_fkey";
ALTER TABLE "TwinLike" ADD CONSTRAINT "TwinLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TwinFollow" DROP CONSTRAINT IF EXISTS "TwinFollow_twinId_fkey";
ALTER TABLE "TwinFollow" ADD CONSTRAINT "TwinFollow_twinId_fkey" FOREIGN KEY ("twinId") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TwinFollow" DROP CONSTRAINT IF EXISTS "TwinFollow_userId_fkey";
ALTER TABLE "TwinFollow" ADD CONSTRAINT "TwinFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TwinBlockedUsers" DROP CONSTRAINT IF EXISTS "TwinBlockedUsers_twinId_fkey";
ALTER TABLE "TwinBlockedUsers" ADD CONSTRAINT "TwinBlockedUsers_twinId_fkey"
  FOREIGN KEY ("twinId") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TwinBlockedUsers" DROP CONSTRAINT IF EXISTS "TwinBlockedUsers_userId_fkey";
ALTER TABLE "TwinBlockedUsers" ADD CONSTRAINT "TwinBlockedUsers_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublicChat" DROP CONSTRAINT IF EXISTS "PublicChat_twinId_fkey";
ALTER TABLE "PublicChat" ADD CONSTRAINT "PublicChat_twinId_fkey" FOREIGN KEY ("twinId") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ✅ ADD (new): when a user is deleted, keep chats but anonymize them
-- ✅ FIX: Clean orphaned userId values BEFORE adding constraint
UPDATE "PublicChat" 
SET "userId" = NULL 
WHERE "userId" IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = "PublicChat"."userId");

ALTER TABLE "PublicChat" DROP CONSTRAINT IF EXISTS "PublicChat_userId_fkey";
ALTER TABLE "PublicChat" ADD CONSTRAINT "PublicChat_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "PublicMessage" DROP CONSTRAINT IF EXISTS "PublicMessage_chatId_fkey";
ALTER TABLE "PublicMessage" ADD CONSTRAINT "PublicMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "PublicChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys for new tables
ALTER TABLE "AILearning" DROP CONSTRAINT IF EXISTS "AILearning_twinId_fkey";

-- ✅ FIX: Cleanup orphan rows before adding FK constraint
DELETE FROM "AILearning" al
WHERE NOT EXISTS (
  SELECT 1 FROM "Twin" t WHERE t.id = al."twinId"
);

ALTER TABLE "AILearning" ADD CONSTRAINT "AILearning_twinId_fkey"
  FOREIGN KEY ("twinId") REFERENCES "Twin"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContentReport" DROP CONSTRAINT IF EXISTS "ContentReport_reporterId_fkey";
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemoryLongTerm" DROP CONSTRAINT IF EXISTS "MemoryLongTerm_twinId_fkey";
ALTER TABLE "MemoryLongTerm" ADD CONSTRAINT "MemoryLongTerm_twinId_fkey" FOREIGN KEY ("twinId") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemorySession" DROP CONSTRAINT IF EXISTS "MemorySession_chatId_fkey";
ALTER TABLE "MemorySession" ADD CONSTRAINT "MemorySession_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemorySessionPublic" DROP CONSTRAINT IF EXISTS "MemorySessionPublic_chatId_fkey";
ALTER TABLE "MemorySessionPublic" ADD CONSTRAINT "MemorySessionPublic_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "PublicChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TwinPerformance" DROP CONSTRAINT IF EXISTS "TwinPerformance_twinId_fkey";
ALTER TABLE "TwinPerformance" ADD CONSTRAINT "TwinPerformance_twinId_fkey" FOREIGN KEY ("twinId") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_runs" DROP CONSTRAINT IF EXISTS "ai_runs_twin_id_fkey";
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_twin_id_fkey" FOREIGN KEY ("twin_id") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mem_chunks" DROP CONSTRAINT IF EXISTS "mem_chunks_twin_id_fkey";
ALTER TABLE "mem_chunks" ADD CONSTRAINT "mem_chunks_twin_id_fkey" FOREIGN KEY ("twin_id") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "style_anchors" DROP CONSTRAINT IF EXISTS "style_anchors_twin_id_fkey";
ALTER TABLE "style_anchors" ADD CONSTRAINT "style_anchors_twin_id_fkey" FOREIGN KEY ("twin_id") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "style_corrections" DROP CONSTRAINT IF EXISTS "style_corrections_twin_id_fkey";
ALTER TABLE "style_corrections" ADD CONSTRAINT "style_corrections_twin_id_fkey" FOREIGN KEY ("twin_id") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- === Counters sync (source of truth: TwinLike/TwinFollow tables) ===
CREATE OR REPLACE FUNCTION "sync_twin_like_count"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE "Twin" SET "likeCount" = "likeCount" + 1 WHERE id = NEW."twinId";
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE "Twin" SET "likeCount" = GREATEST("likeCount" - 1, 0) WHERE id = OLD."twinId";
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_sync_twin_like_count" ON "TwinLike";
CREATE TRIGGER "trg_sync_twin_like_count"
AFTER INSERT OR DELETE ON "TwinLike"
FOR EACH ROW EXECUTE FUNCTION "sync_twin_like_count"();

CREATE OR REPLACE FUNCTION "sync_twin_follow_count"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE "Twin" SET "followCount" = "followCount" + 1 WHERE id = NEW."twinId";
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE "Twin" SET "followCount" = GREATEST("followCount" - 1, 0) WHERE id = OLD."twinId";
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_sync_twin_follow_count" ON "TwinFollow";
CREATE TRIGGER "trg_sync_twin_follow_count"
AFTER INSERT OR DELETE ON "TwinFollow"
FOR EACH ROW EXECUTE FUNCTION "sync_twin_follow_count"();
`;

export async function initializeDatabase() {
  try {
    await db.query(createTablesSQL);
  } catch (error) {
    logger.error('Error initializing database:', error);
    throw error;
  }
}

// Database utility functions
export const userQueries = {
  create: async (email: string, handle?: string, passwordHash?: string, referralCode?: string) => {
    const id = generateBackendId.user();
    const now = new Date();
    const result = await db.query(
      'INSERT INTO "User" (id, email, handle, "passwordHash", "referralCode", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [id, email, handle, passwordHash, referralCode, now, now]
    );
    return result.rows[0];
  },

  findByEmail: async (email: string) => {
    const result = await db.query(
      'SELECT id, email, "passwordHash", "googleId", "googleEmail", "googleEmailVerified", handle, name, dob, phone, bio, active, "referralCode", "createdAt", "profileImage", "lastHandleChangeAt", "profileCompleted" FROM "User" WHERE email = $1',
      [email]
    );
    return result.rows[0];
  },

  findById: async (id: string) => {
    const result = await db.query(
      'SELECT id, email, "passwordHash", "googleId", "googleEmail", "googleEmailVerified", handle, name, dob, phone, bio, active, "referralCode", "createdAt", "profileImage" FROM "User" WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  findByReferralCode: async (referralCode: string) => {
    const result = await db.query(
      'SELECT id, email, "passwordHash", "googleId", "googleEmail", "googleEmailVerified", handle, name, dob, phone, bio, active, "referralCode", "createdAt", "profileImage" FROM "User" WHERE "referralCode" = $1',
      [referralCode]
    );
    return result.rows[0];
  },

  updatePassword: async (email: string, passwordHash: string) => {
    const result = await db.query(
      'UPDATE "User" SET "passwordHash" = $1 WHERE email = $2 RETURNING *',
      [passwordHash, email]
    );
    return result.rows[0];
  },

  activateUser: async (email: string) => {
    const result = await db.query(
      'UPDATE "User" SET active = true WHERE email = $1 RETURNING *',
      [email]
    );
    return result.rows[0];
  },

  updateProfile: async (
    email: string,
    name: string,
    handle: string,
    dob: string | null,
    phone: string,
    bio: string,
    profileImage?: string | null
  ) => {
    // Fix: dob column is DATE type, so we need to cast input to DATE
    // Handle null/empty by keeping existing dob, otherwise cast input to date
    // ✅ FIX: Handle Date objects and strings - convert Date to ISO string first
    let dobString: string | null = null;
    if (dob !== null && dob !== undefined) {
      const dobValue = dob as any; // Type assertion to handle Date objects
      // Check if it's a Date object (can happen when dob comes from database)
      if (typeof dobValue === 'object' && 'toISOString' in dobValue && typeof dobValue.toISOString === 'function') {
        dobString = dobValue.toISOString().split('T')[0]; // Format as YYYY-MM-DD
      } else if (typeof dobValue === 'string') {
        dobString = dobValue.trim();
      }
    }
    const dobValue = dobString && dobString.length > 0 ? dobString : null;
    
    // ✅ FIX: Handle profileImage properly - empty string means remove image, null means keep current
    const profileImageValue = profileImage === undefined 
      ? null  // Not provided, keep current
      : (profileImage === null || profileImage === '' 
          ? null  // Explicitly null or empty string means remove image (set to NULL in DB)
          : profileImage);  // Otherwise use the provided value
    
    const result = await db.query(
      `UPDATE "User"
       SET
         name = $1,
         handle = $2,
         dob = COALESCE($3::date, dob),
         phone = $4,
         bio = $5,
         "profileImage" = $6,
         "profileCompleted" = true
       WHERE email = $7
       RETURNING *`,
      [name, handle, dobValue, phone, bio, profileImageValue, email]
    );
    
    return result.rows[0];
  },

  findByGoogleId: async (googleId: string) => {
    const result = await db.query(
      'SELECT id, email, "passwordHash", "googleId", "googleEmail", "googleEmailVerified", handle, name, dob, phone, bio, active, "referralCode", "createdAt", "profileImage", "lastHandleChangeAt", "profileCompleted" FROM "User" WHERE "googleId" = $1',
      [googleId]
    );
    return result.rows[0];
  },

  linkGoogleByEmail: async (email: string, googleId: string, googleEmail?: string, googleEmailVerified?: boolean) => {
    const result = await db.query(
      `UPDATE "User" 
       SET "googleId" = $1, "googleEmail" = $2, "googleEmailVerified" = $3, active = true, "updatedAt" = $4
       WHERE email = $5 
       RETURNING *`,
      [googleId, googleEmail || null, googleEmailVerified || false, new Date(), email]
    );
    return result.rows[0];
  }

};

export const twinQueries = {
  create: async (userId: string, styleVector: any, sampleReply?: string, instructions?: any) => {
    const id = generateBackendId.twin();
    const result = await db.query(
      'INSERT INTO "Twin" (id, "userId", "styleVector", "sampleReply", "instructions") VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, userId, JSON.stringify(styleVector), sampleReply, instructions ? JSON.stringify(instructions) : null]
    );
    return result.rows[0];
  },

  findByUserId: async (userId: string) => {
    const result = await db.query(
      `SELECT
        id,
        "userId",
        "styleVector",
        "sampleReply",
        "isPublic",
        "publicHandle",
        bio,
        "profileImage",
        verified,
        "likeCount",
        "followCount",
        "chatCount",
        "createdAt" AT TIME ZONE 'UTC' AS "createdAt",
        "updatedAt" AT TIME ZONE 'UTC' AS "updatedAt",
        "showChatHistory",
        "requireLogin",
        "blockNonLoggedUsers",
        "allowLikes",
        "allowFollows",
        "allowShares"
      FROM "Twin"
      WHERE "userId" = $1`,
      [userId]
    );    
    return result.rows;
  },

  updateInstructions: async (userId: string, instructions: any) => {
    const result = await db.query(
      'UPDATE "Twin" SET "instructions" = $1 WHERE "userId" = $2 RETURNING *',
      [JSON.stringify(instructions), userId]
    );
    return result.rows[0];
  },

  updateStyleVector: async (userId: string, styleVector: any) => {
    const result = await db.query(
      'UPDATE "Twin" SET "styleVector" = $1 WHERE "userId" = $2 RETURNING *',
      [JSON.stringify(styleVector), userId]
    );
    return result.rows[0];
  },

  findById: async (twinId: string) => {
    const result = await db.query(
      `SELECT
        id,
        "userId",
        "styleVector",
        "sampleReply",
        "instructions",
        "isPublic",
        "publicHandle",
        bio,
        "profileImage",
        verified,
        "likeCount",
        "followCount",
        "chatCount",
        "createdAt" AT TIME ZONE 'UTC' AS "createdAt",
        "updatedAt" AT TIME ZONE 'UTC' AS "updatedAt",
        "showChatHistory",
        "requireLogin",
        "blockNonLoggedUsers",
        "allowLikes",
        "allowFollows",
        "allowShares"
      FROM "Twin"
      WHERE id = $1`,
      [twinId]
    );    
    return result.rows[0];
  },

  delete: async (twinId: string, userId: string) => {
    // Verify ownership before deletion
    await verifyTwinOwnership(twinId, userId);
    
    // Delete twin (CASCADE will handle related data)
    const result = await db.query(
      'DELETE FROM "Twin" WHERE id = $1 AND "userId" = $2 RETURNING *',
      [twinId, userId]
    );
    
    return result.rows[0];
  }
};

export const chatQueries = {
  create: async (userId: string, twinId: string) => {
    const id = generateBackendId.chat();
    const result = await db.query(
      'INSERT INTO "Chat" (id, "userId", "twinId") VALUES ($1, $2, $3) RETURNING *',
      [id, userId, twinId]
    );
    return result.rows[0];
  },

  findByUserId: async (userId: string) => {
    const result = await db.query(
      'SELECT id, "userId", "twinId", "createdAt" FROM "Chat" WHERE "userId" = $1',
      [userId]
    );
    return result.rows;
  }
};

export const messageQueries = {
  create: async (chatId: string, sender: 'human' | 'twin', content: string, approved = false) => {
    const id = generateBackendId.message();
    const result = await db.query(
      'INSERT INTO "Message" (id, "chatId", sender, content, approved) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, chatId, sender, content, approved]
    );
    return result.rows[0];
  },

  findByChatId: async (chatId: string) => {
    const result = await db.query(
      'SELECT id, "chatId", sender, content, approved, "createdAt" FROM "Message" WHERE "chatId" = $1 AND approved = true ORDER BY "createdAt" ASC',
      [chatId]
    );
    return result.rows;
  }
};

// Export db for direct use
export { db };

export const otpQueries = {
  create: async (email: string, codeHash: string, expiresAt: Date, purpose: string) => {
    const id = generateBackendId.otp();
    const result = await db.query(
      'INSERT INTO "OTP" (id, email, purpose, "codeHash", "expiresAt") VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, email, purpose, codeHash, expiresAt]
    );
    return result.rows[0];
  },

  findByEmail: async (email: string, purpose: string) => {
    const result = await db.query(
      'SELECT id, email, purpose, "codeHash", "expiresAt", "createdAt", used FROM "OTP" WHERE email = $1 AND purpose = $2 ORDER BY "createdAt" DESC LIMIT 1',
      [email, purpose]
    );    
    return result.rows[0];
  },

  markAsUsed: async (id: string) => {
    const result = await db.query('UPDATE "OTP" SET used = true WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  },

  deleteByEmail: async (email: string, purpose?: string) => {
    if (purpose) {
      await db.query('DELETE FROM "OTP" WHERE email = $1 AND purpose = $2', [email.toLowerCase(), purpose]);
      return;
    }
    await db.query('DELETE FROM "OTP" WHERE email = $1', [email.toLowerCase()]);
  }
};

// Public Twin Queries - Updated to use TwinProfile
export const publicTwinQueries = {
  makePublic: async (twinId: string, bio?: string, profileImage?: string) => {
    // ✅ Update Twin directly
    const result = await db.query(
      `UPDATE "Twin"
       SET "isPublic" = true,
           bio = COALESCE($2, bio),
           "profileImage" = COALESCE($3, "profileImage"),
           "updatedAt" = NOW()
       WHERE id = $1
       RETURNING *`,
      [twinId, bio || null, profileImage || null]
    );
    return result.rows[0];
  },

  makePrivate: async (twinId: string) => {
    // ✅ Update Twin directly
    const result = await db.query(
      `UPDATE "Twin"
       SET "isPublic" = false,
           "publicHandle" = NULL,
           "updatedAt" = NOW()
       WHERE id = $1
       RETURNING *`,
      [twinId]
    );
    return result.rows[0];
  },

  findByPublicHandle: async (handle: string) => {
    // handle = User.handle (not Twin.publicHandle)
    const result = await db.query(
      `SELECT 
         t.*,
         u.handle as "userHandle",
         u.name   as "userName"
       FROM "Twin" t
       JOIN "User" u ON t."userId" = u.id
       WHERE u.handle = $1
         AND t."isPublic" = true`,
      [handle]
    );
    return result.rows[0];
  },  

  getPublicTwins: async (limit = 20, offset = 0) => {
    // ✅ Use Twin directly
    const result = await db.query(
      `SELECT 
         t.*,
         u.handle as "userHandle",
         u.name   as "userName"
       FROM "Twin" t
       JOIN "User" u ON t."userId" = u.id
       WHERE t."isPublic" = true
         AND (t."blockNonLoggedUsers" = false OR t."blockNonLoggedUsers" IS NULL)
       ORDER BY t."likeCount" DESC, t."chatCount" DESC, t."createdAt" DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  },

  updateProfile: async (twinId: string, bio?: string, profileImage?: string) => {
    // ✅ Update Twin directly (no publicHandle changes - URLs are /@user.handle)
    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;

    if (bio !== undefined) {
      updates.push(`bio = $${i++}`);
      values.push(bio);
    }
    if (profileImage !== undefined) {
      updates.push(`"profileImage" = $${i++}`);
      values.push(profileImage);
    }
    if (!updates.length) throw new Error('No fields to update');

    updates.push(`"updatedAt" = NOW()`);

    values.push(twinId);
    const result = await db.query(
      `UPDATE "Twin" SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    return result.rows[0];
  }
};

// Twin Like Queries
export const twinLikeQueries = {
  create: async (twinId: string, userId: string) => {
    const id = generateBackendId.like();
    const result = await db.query(
      'INSERT INTO "TwinLike" (id, "twinId", "userId") VALUES ($1, $2, $3) RETURNING *',
      [id, twinId, userId]
    );
    // ✅ Count updated by DB trigger (sync_twin_like_count)
    
    // ✅ OPTIMIZED: Update performance scores async (non-blocking)
    const { updateTwinPerformanceScores } = await import('../services/twinPerformanceService');
    updateTwinPerformanceScores(twinId).catch(err => 
      logger.warn('Performance score update failed for like:', err)
    );
    
    return result.rows[0];
  },
  
  remove: async (twinId: string, userId: string) => {
    const result = await db.query(
      'DELETE FROM "TwinLike" WHERE "twinId" = $1 AND "userId" = $2 RETURNING *',
      [twinId, userId]
    );
    // ✅ Count updated by DB trigger (sync_twin_like_count)
    if (result.rows.length > 0) {
      // ✅ OPTIMIZED: Update performance scores async (non-blocking)
      const { updateTwinPerformanceScores } = await import('../services/twinPerformanceService');
      updateTwinPerformanceScores(twinId).catch(err => 
        logger.warn('Performance score update failed for unlike:', err)
      );
    }
    return result.rows[0];
  },

  findByTwinAndUser: async (twinId: string, userId: string) => {
    const result = await db.query(
      'SELECT * FROM "TwinLike" WHERE "twinId" = $1 AND "userId" = $2',
      [twinId, userId]
    );
    return result.rows[0];
  },

  getTwinLikes: async (twinId: string) => {
    const result = await db.query(
      'SELECT COUNT(*) as count FROM "TwinLike" WHERE "twinId" = $1',
      [twinId]
    );
    return parseInt(result.rows[0].count);
  }
};

// Twin Follow Queries
export const twinFollowQueries = {
  create: async (twinId: string, userId: string) => {
    const id = generateBackendId.follow();
    const result = await db.query(
      'INSERT INTO "TwinFollow" (id, "twinId", "userId") VALUES ($1, $2, $3) RETURNING *',
      [id, twinId, userId]
    );
    // ✅ Count updated by DB trigger (sync_twin_follow_count)
    
    // ✅ OPTIMIZED: Update performance scores async (non-blocking)
    const { updateTwinPerformanceScores } = await import('../services/twinPerformanceService');
    updateTwinPerformanceScores(twinId).catch(err => 
      logger.warn('Performance score update failed for follow:', err)
    );
    
    return result.rows[0];
  },
  
  remove: async (twinId: string, userId: string) => {
    const result = await db.query(
      'DELETE FROM "TwinFollow" WHERE "twinId" = $1 AND "userId" = $2 RETURNING *',
      [twinId, userId]
    );
    // ✅ Count updated by DB trigger (sync_twin_follow_count)
    if (result.rows.length > 0) {
      // ✅ OPTIMIZED: Update performance scores async (non-blocking)
      const { updateTwinPerformanceScores } = await import('../services/twinPerformanceService');
      updateTwinPerformanceScores(twinId).catch(err => 
        logger.warn('Performance score update failed for unfollow:', err)
      );
    }
    return result.rows[0];
  },

  findByTwinAndUser: async (twinId: string, userId: string) => {
    const result = await db.query(
      'SELECT * FROM "TwinFollow" WHERE "twinId" = $1 AND "userId" = $2',
      [twinId, userId]
    );
    return result.rows[0];
  },

  getTwinFollows: async (twinId: string) => {
    const result = await db.query(
      'SELECT COUNT(*) as count FROM "TwinFollow" WHERE "twinId" = $1',
      [twinId]
    );
    return parseInt(result.rows[0].count);
  }
};

// Public Chat Queries
export const publicChatQueries = {
  create: async (twinId: string, visitorId?: string, userId?: string) => {
    const id = generateBackendId.chat();
    logger.debug(`[publicChatQueries.create] Creating chat - Id: ${id}, TwinId: ${twinId}`);
    const result = await db.query(
      'INSERT INTO "PublicChat" (id, "twinId", "visitorId", "userId") VALUES ($1, $2, $3, $4) RETURNING *',
      [id, twinId, visitorId || null, userId || null]
    );
    if (result && result.rows && result.rows[0]) {
      logger.debug(`[publicChatQueries.create] Chat created successfully`);
    }
    
    // ✅ Cleanup old anonymous chats for this twin (keep only last 100)
    if (!userId && visitorId) {
      // This is an anonymous chat - cleanup old ones
      await publicChatQueries.cleanupOldAnonymousChats(twinId, 100);
    }
    
    // Update chat count
    await db.query('UPDATE "Twin" SET "chatCount" = "chatCount" + 1 WHERE id = $1', [twinId]);
    
    // ✅ OPTIMIZED: Update performance scores async (non-blocking)
    const { updateTwinPerformanceScores } = await import('../services/twinPerformanceService');
    updateTwinPerformanceScores(twinId).catch(err => 
      logger.warn('Performance score update failed for chat creation:', err)
    );
    
    return result?.rows?.[0];
  },
  
  // ✅ NEW: Cleanup old anonymous chats (keep only last N)
  cleanupOldAnonymousChats: async (twinId: string, keepCount: number = 100) => {
    try {
      logger.debug(`[cleanupOldAnonymousChats] Starting cleanup for twin ${twinId}`);
      
      // Get IDs of anonymous chats to keep (most recent N)
      const keepResult = await db.query(`
        SELECT id, "visitorId", "createdAt", "lastActivity", "messageCount"
        FROM "PublicChat"
        WHERE "twinId" = $1 
          AND "userId" IS NULL 
          AND "visitorId" IS NOT NULL
        ORDER BY "lastActivity" DESC NULLS LAST, "createdAt" DESC
        LIMIT $2
      `, [twinId, keepCount]);
      
      const keepIds = keepResult.rows.map(row => row.id);
      
      if (keepIds.length === 0) {
        logger.debug(`[cleanupOldAnonymousChats] No anonymous chats to cleanup`);
        return; // No anonymous chats to cleanup
      }
      
      // Delete old anonymous chats (not in keep list)
      // Note: CASCADE will automatically delete related PublicMessage records
      const deleteResult = await db.query(`
        DELETE FROM "PublicChat"
        WHERE "twinId" = $1 
          AND "userId" IS NULL 
          AND "visitorId" IS NOT NULL
          AND id NOT IN (${keepIds.map((_, i) => `$${i + 2}`).join(', ')})
        RETURNING id, "visitorId", "createdAt"
      `, [twinId, ...keepIds]);
      
      const deletedCount = deleteResult.rowCount || 0;
      if (deletedCount > 0) {
        logger.debug(`[cleanupOldAnonymousChats] Cleaned up ${deletedCount} old anonymous chats`);
        
        // Update chat count (subtract deleted chats)
        await db.query(`
          UPDATE "Twin" 
          SET "chatCount" = GREATEST(0, "chatCount" - $1) 
          WHERE id = $2
        `, [deletedCount, twinId]);
      }
    } catch (error) {
      logger.error('Error cleaning up old anonymous chats:', error);
      // Don't throw - cleanup failure shouldn't break chat creation
    }
  },
  
  updateMessageCount: async (chatId: string) => {
    const utcTimestamp = new Date().toISOString();
    const result = await db.query(
      'UPDATE "PublicChat" SET "messageCount" = "messageCount" + 1, "lastActivity" = $2::timestamptz, "updatedAt" = $2::timestamptz WHERE id = $1 RETURNING *',
      [chatId, utcTimestamp]
    );
    return result.rows[0];
  },

  findByTwinAndVisitor: async (twinId: string, visitorId?: string) => {
    const result = await db.query(
      'SELECT * FROM "PublicChat" WHERE "twinId" = $1 AND ("visitorId" = $2 OR ("visitorId" IS NULL AND $2 IS NULL)) ORDER BY "createdAt" DESC',
      [twinId, visitorId || null]
    );
    return result.rows; // Return all chats, not just one
  },

    // ✅ NEW: Find latest public chat for a twin + user (canonical default thread)
    findLatestByTwinAndUser: async (twinId: string, userId: string) => {
      const result = await db.query(
        `
        SELECT *
        FROM "PublicChat"
        WHERE "twinId" = $1
          AND "userId" = $2
        ORDER BY "lastActivity" DESC NULLS LAST, "createdAt" DESC
        LIMIT 1
        `,
        [twinId, userId]
      );
      return result.rows[0] || null;
    },

  findAllByTwinAndVisitor: async (twinId: string, visitorId?: string) => {
    const result = await db.query(
      'SELECT * FROM "PublicChat" WHERE "twinId" = $1 AND ("visitorId" = $2 OR ("visitorId" IS NULL AND $2 IS NULL)) ORDER BY "createdAt" DESC',
      [twinId, visitorId || null]
    );
    return result.rows;
  }
};

// Add PublicMessage queries after the existing publicChatQueries
export const publicMessageQueries = {
  create: async (chatId: string, sender: 'human' | 'twin', content: string) => {
    const id = generateBackendId.message();
    const result = await db.query(
      'INSERT INTO "PublicMessage" (id, "chatId", sender, content, approved) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, chatId, sender, content, true]
    );
    return result.rows[0];
  },

  findByChatId: async (chatId: string, limit: number = 50) => {
    const result = await db.query(
      'SELECT * FROM "PublicMessage" WHERE "chatId" = $1 AND approved = true ORDER BY "createdAt" ASC LIMIT $2',
      [chatId, limit]
    );
    return result.rows;
  },

  getRecentMessages: async (chatId: string, limit: number = 10) => {
    const result = await db.query(
      'SELECT content, sender, "createdAt" FROM "PublicMessage" WHERE "chatId" = $1 AND approved = true ORDER BY "createdAt" DESC LIMIT $2',
      [chatId, limit]
    );
    return result.rows.reverse();
  },

  updateMessageCount: async (chatId: string) => {
    const utcTimestamp = new Date().toISOString();
    const result = await db.query(
      'UPDATE "PublicChat" SET "messageCount" = "messageCount" + 1, "lastActivity" = $2::timestamptz WHERE id = $1 RETURNING *',
      [chatId, utcTimestamp]
    );
    return result.rows[0];
  }
};

// Style Anchors Queries
export const styleAnchorsQueries = {
  create: async (
    twinId: string, 
    userUtterance: string, 
    idealReply: string, 
    tags: string[] = [],
    type: 'interaction' | 'phrase' | 'pattern' = 'interaction',
    phrase?: string,
    patternType?: string,
    context?: string
  ) => {
    const id = generateBackendId.anchor();
    const result = await db.query(
      'INSERT INTO "style_anchors" (id, twin_id, user_utterance, ideal_reply, tags, type, phrase, pattern_type, context) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [id, twinId, userUtterance, idealReply, tags, type, phrase || null, patternType || null, context || null]
    );
    return result.rows[0];
  },  

  findByTwinId: async (twinId: string, limit = 10, offset = 0) => {
    const result = await db.query(
      'SELECT * FROM "style_anchors" WHERE twin_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [twinId, limit, offset]
    );
    return result.rows;
  },

  findById: async (anchorId: string) => {
    const result = await db.query('SELECT * FROM "style_anchors" WHERE id = $1', [anchorId]);
    return result.rows[0];
  },

  update: async (
    anchorId: string, 
    userUtterance: string, 
    idealReply: string, 
    tags: string[],
    type?: 'interaction' | 'phrase' | 'pattern',
    phrase?: string,
    patternType?: string,
    context?: string
  ) => {
    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    updates.push(`user_utterance = $${paramCount++}`);
    values.push(userUtterance);
    
    updates.push(`ideal_reply = $${paramCount++}`);
    values.push(idealReply);
    
    updates.push(`tags = $${paramCount++}`);
    values.push(tags);
    
    if (type) {
      updates.push(`type = $${paramCount++}`);
      values.push(type);
    }
    
    if (phrase !== undefined) {
      updates.push(`phrase = $${paramCount++}`);
      values.push(phrase);
    }
    
    if (patternType !== undefined) {
      updates.push(`pattern_type = $${paramCount++}`);
      values.push(patternType);
    }
    
    if (context !== undefined) {
      updates.push(`context = $${paramCount++}`);
      values.push(context);
    }
    
    values.push(anchorId);
    const query = `UPDATE "style_anchors" SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    
    const result = await db.query(query, values);
    return result.rows[0];
  },  

  delete: async (anchorId: string) => {
    const result = await db.query('DELETE FROM "style_anchors" WHERE id = $1 RETURNING *', [anchorId]);
    return result.rows[0];
  },

  findByTwinAndSimilarity: async (
    twinId: string, 
    userMessage: string, 
    limit = 2,
    type?: 'interaction' | 'phrase' | 'pattern'
  ) => {
    let query = `
      SELECT *, 
       similarity(user_utterance, $2::text) as sim_score 
       FROM "style_anchors" 
       WHERE twin_id = $1`;
    
    const params: any[] = [twinId, userMessage];
    
    // Only get interactions for similarity matching (phrases don't need similarity)
    if (!type) {
      query += ` AND type = 'interaction'`;
    } else {
      query += ` AND type = $${params.length + 1}`;
      params.push(type);
    }
    
    query += ` ORDER BY sim_score DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    try {
      const result = await db.query(query, params);
      return result.rows;
    } catch (error: any) {
      // Fallback: if similarity function fails, use recency-based search
      if (error.code === '42883' || error.message?.includes('similarity') || error.message?.includes('does not exist')) {
        logger.warn('Similarity function not available, falling back to recency-based search', {
          error: error.message,
          twinId,
          userMessage
        });
        
        let fallbackQuery = `
          SELECT *, 0.5 as sim_score 
          FROM "style_anchors" 
          WHERE twin_id = $1`;
        
        const fallbackParams: any[] = [twinId];
        
        if (!type) {
          fallbackQuery += ` AND type = 'interaction'`;
        } else {
          fallbackQuery += ` AND type = $2`;
          fallbackParams.push(type);
        }
        
        fallbackQuery += ` ORDER BY created_at DESC LIMIT $${fallbackParams.length + 1}`;
        fallbackParams.push(limit);
        
        const result = await db.query(fallbackQuery, fallbackParams);
        return result.rows;
      }
      // Re-throw if it's a different error
      throw error;
    }
  },  
  
  // NEW METHOD: Find phrases for a twin
  findPhrasesByTwinId: async (twinId: string, limit = 5) => {
    const result = await db.query(
      'SELECT * FROM "style_anchors" WHERE twin_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT $3',
      [twinId, 'phrase', limit]
    );
    return result.rows;
  },  
};

// Style Corrections Queries
export const styleCorrectionsQueries = {
  create: async (twinId: string, knob: string, delta: number, source?: string) => {
    const id = generateBackendId.correction();
    const result = await db.query(
      'INSERT INTO "style_corrections" (id, twin_id, knob, delta, source) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, twinId, knob, delta, source]
    );
    return result.rows[0];
  },

  findByTwinId: async (twinId: string, limit = 50) => {
    const result = await db.query(
      'SELECT * FROM "style_corrections" WHERE twin_id = $1 ORDER BY ts DESC LIMIT $2',
      [twinId, limit]
    );
    return result.rows;
  },

  getAggregatedCorrections: async (twinId: string) => {
    const result = await db.query(
      `SELECT knob, SUM(delta) as total_delta, COUNT(*) as correction_count 
       FROM "style_corrections" 
       WHERE twin_id = $1 
       GROUP BY knob`,
      [twinId]
    );
    return result.rows;
  }
};

// AI Runs Queries
export const aiRunsQueries = {
  create: async (twinId: string, mode: string, tokensIn: number, tokensOut: number, latencyMs: number, criticScore?: number, regen = false) => {
    const id = generateBackendId.run();
    const result = await db.query(
      'INSERT INTO "ai_runs" (id, twin_id, mode, tokens_in, tokens_out, critic_score, regen, latency_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, twin_id, mode, tokens_in, tokens_out, critic_score, regen, latency_ms, ts',      
      [id, twinId, mode, tokensIn, tokensOut, criticScore || null, regen, latencyMs]
    );
    return result.rows[0];
  },

  findByTwinId: async (twinId: string, limit = 100, offset = 0) => {
    const result = await db.query(
      'SELECT id, twin_id, mode, tokens_in, tokens_out, critic_score, regen, latency_ms, ts FROM "ai_runs" WHERE twin_id = $1 ORDER BY ts DESC LIMIT $2 OFFSET $3',      
      [twinId, limit, offset]
    );
    return result.rows;
  },

  getQualityMetrics: async (twinId: string, days = 7) => {
    const result = await db.query(
      `SELECT 
         AVG(critic_score) as avg_critic_score,
         COUNT(*) as total_runs,
         COUNT(CASE WHEN critic_score >= 80 THEN 1 END) as high_quality_runs,
         AVG(latency_ms) as avg_latency,
         AVG(tokens_in) as avg_tokens_in,
         AVG(tokens_out) as avg_tokens_out
       FROM "ai_runs" 
       WHERE twin_id = $1 AND ts >= NOW() - INTERVAL $2`,
      [twinId, `${days} days`]
    );
    return result.rows[0];
  },

  getRecentRuns: async (twinId: string, hours = 24) => {
    const result = await db.query(
      'SELECT id, twin_id, mode, tokens_in, tokens_out, critic_score, regen, latency_ms, ts FROM "ai_runs" WHERE twin_id = $1 AND ts >= NOW() - INTERVAL $2 ORDER BY ts DESC',      
      [twinId, `${hours} hours`]
    );
    return result.rows;
  }
};

// Memory Session Queries
export const memorySessionQueries = {
  create: async (chatId: string, summary: string, keyTopics: string[], vector: any) => {
    const id = generateBackendId.memSess();
    const utcTimestamp = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO "MemorySession" (id, "chatId", summary, "keyTopics", vector, "messageCount", "lastUpdated")
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
       RETURNING *`,
      [id, chatId, summary, keyTopics, JSON.stringify(vector), 0, utcTimestamp]
    );
    return result.rows[0];
  },

  findByChatId: async (chatId: string) => {
    const result = await db.query(
      'SELECT * FROM "MemorySession" WHERE "chatId" = $1',
      [chatId]
    );
    return result.rows[0] || null;
  },

  update: async (chatId: string, summary: string, keyTopics: string[], vector: any, messageCount: number) => {
    // First get the existing record's id to ensure we update by primary key
    const existing = await db.query(
      'SELECT id FROM "MemorySession" WHERE "chatId" = $1',
      [chatId]
    );
    
    if (existing.rows.length === 0) {
      throw new Error(`No MemorySession found for chatId: ${chatId}`);
    }
    
    const utcTimestamp = new Date().toISOString();
    const result = await db.query(
      `UPDATE "MemorySession" 
       SET summary = $1, "keyTopics" = $2, vector = $3, "messageCount" = $4, "lastUpdated" = $5::timestamptz
       WHERE id = $6
       RETURNING *`,
      [summary, keyTopics, JSON.stringify(vector), messageCount, utcTimestamp, existing.rows[0].id]
    );
    return result.rows[0];
  }
};

// Memory LongTerm Queries
export const memoryLongTermQueries = {
  create: async (twinId: string, key: string, value: string, category: string, source: string = 'session') => {
    const id = generateBackendId.memLt();
    const utcTimestamp = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO "MemoryLongTerm" (id, "twinId", key, value, category, source, "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
       ON CONFLICT ("twinId", key) 
       DO UPDATE SET value = EXCLUDED.value, category = EXCLUDED.category, "updatedAt" = $7::timestamptz
       RETURNING *`,
      [id, twinId, key, value, category, source, utcTimestamp]
    );
    return result.rows[0];
  },

  findByTwinId: async (twinId: string, category?: string, limit: number = 10) => {
    let query = 'SELECT * FROM "MemoryLongTerm" WHERE "twinId" = $1';
    const params: any[] = [twinId];
    
    if (category) {
      query += ' AND category = $2';
      params.push(category);
      query += ' ORDER BY "updatedAt" DESC LIMIT $3';
      params.push(limit);
    } else {
      query += ' ORDER BY "updatedAt" DESC LIMIT $2';
      params.push(limit);
    }
    
    const result = await db.query(query, params);
    return result.rows;
  },

  delete: async (twinId: string, key: string) => {
    const result = await db.query(
      'DELETE FROM "MemoryLongTerm" WHERE "twinId" = $1 AND key = $2 RETURNING *',
      [twinId, key]
    );
    return result.rows[0];
  }
};

