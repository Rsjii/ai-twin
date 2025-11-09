"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryLongTermQueries = exports.memorySessionQueries = exports.aiRunsQueries = exports.styleCorrectionsQueries = exports.memChunksQueries = exports.styleAnchorsQueries = exports.publicMessageQueries = exports.publicChatQueries = exports.twinFollowQueries = exports.twinLikeQueries = exports.publicTwinQueries = exports.otpQueries = exports.db = exports.messageQueries = exports.chatQueries = exports.twinQueries = exports.userQueries = void 0;
exports.initializeDatabase = initializeDatabase;
exports.generateId = generateId;
const db_1 = require("./db");
Object.defineProperty(exports, "db", { enumerable: true, get: function () { return db_1.db; } });
const logger_1 = require("./logger");
const createTablesSQL = `
-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "MessageSender" AS ENUM ('human', 'twin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "handle" TEXT,
    "name" TEXT,
    "dob" TEXT,
    "phone" TEXT,
    "bio" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "referralCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Twin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "styleVector" JSONB NOT NULL,
    "sampleReply" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "publicHandle" TEXT,
    "bio" TEXT,
    "profileImage" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "followCount" INTEGER NOT NULL DEFAULT 0,
    "chatCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Twin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Chat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "content" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OTP" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
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
CREATE TABLE IF NOT EXISTS "PublicChat" (
    "id" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "visitorId" TEXT,
    "userId" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PublicMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "content" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_handle_key" ON "User"("handle");
CREATE UNIQUE INDEX IF NOT EXISTS "Invite_code_key" ON "Invite"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Twin_userId_key" ON "Twin"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Twin_publicHandle_key" ON "Twin"("publicHandle");
CREATE UNIQUE INDEX IF NOT EXISTS "TwinLike_twinId_userId_key" ON "TwinLike"("twinId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "TwinFollow_twinId_userId_key" ON "TwinFollow"("twinId", "userId");

-- Add missing columns to User table if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'dob') THEN
        ALTER TABLE "User" ADD COLUMN "dob" TEXT;
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
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'User' AND indexname = 'User_referralCode_idx') THEN
        CREATE UNIQUE INDEX "User_referralCode_idx" ON "User"("referralCode");
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

ALTER TABLE "PublicChat" DROP CONSTRAINT IF EXISTS "PublicChat_twinId_fkey";
ALTER TABLE "PublicChat" ADD CONSTRAINT "PublicChat_twinId_fkey" FOREIGN KEY ("twinId") REFERENCES "Twin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublicMessage" DROP CONSTRAINT IF EXISTS "PublicMessage_chatId_fkey";
ALTER TABLE "PublicMessage" ADD CONSTRAINT "PublicMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "PublicChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;
async function initializeDatabase() {
    try {
        console.log('Initializing database...');
        await db_1.db.query(createTablesSQL);
        console.log('Database initialized successfully!');
    }
    catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
}
function generateId() {
    return 'c' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}
exports.userQueries = {
    create: async (email, handle, passwordHash, referralCode) => {
        const id = generateId();
        const now = new Date();
        const result = await db_1.db.query('INSERT INTO "User" (id, email, handle, "passwordHash", "referralCode", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *', [id, email, handle, passwordHash, referralCode, now, now]);
        return result.rows[0];
    },
    findByEmail: async (email) => {
        const result = await db_1.db.query('SELECT * FROM "User" WHERE email = $1', [email]);
        return result.rows[0];
    },
    findById: async (id) => {
        const result = await db_1.db.query('SELECT * FROM "User" WHERE id = $1', [id]);
        return result.rows[0];
    },
    findByReferralCode: async (referralCode) => {
        const result = await db_1.db.query('SELECT * FROM "User" WHERE "referralCode" = $1', [referralCode]);
        return result.rows[0];
    },
    updatePassword: async (email, passwordHash) => {
        const result = await db_1.db.query('UPDATE "User" SET "passwordHash" = $1 WHERE email = $2 RETURNING *', [passwordHash, email]);
        return result.rows[0];
    },
    activateUser: async (email) => {
        const result = await db_1.db.query('UPDATE "User" SET active = true WHERE email = $1 RETURNING *', [email]);
        return result.rows[0];
    },
    updateProfile: async (email, name, handle, dob, phone, bio, profileImage) => {
        const result = await db_1.db.query('UPDATE "User" SET name = $1, handle = $2, dob = $3, phone = $4, bio = $5, "profileImage" = $6 WHERE email = $7 RETURNING *', [name, handle, dob, phone, bio, profileImage || null, email]);
        return result.rows[0];
    }
};
exports.twinQueries = {
    create: async (userId, styleVector, sampleReply, instructions) => {
        const id = generateId();
        const result = await db_1.db.query('INSERT INTO "Twin" (id, "userId", "styleVector", "sampleReply", "instructions") VALUES ($1, $2, $3, $4, $5) RETURNING *', [id, userId, JSON.stringify(styleVector), sampleReply, instructions ? JSON.stringify(instructions) : null]);
        return result.rows[0];
    },
    findByUserId: async (userId) => {
        const result = await db_1.db.query('SELECT * FROM "Twin" WHERE "userId" = $1', [userId]);
        return result.rows;
    },
    updateInstructions: async (userId, instructions) => {
        const result = await db_1.db.query('UPDATE "Twin" SET "instructions" = $1 WHERE "userId" = $2 RETURNING *', [JSON.stringify(instructions), userId]);
        return result.rows[0];
    },
    updateStyleVector: async (userId, styleVector) => {
        const result = await db_1.db.query('UPDATE "Twin" SET "styleVector" = $1 WHERE "userId" = $2 RETURNING *', [JSON.stringify(styleVector), userId]);
        return result.rows[0];
    },
    findById: async (twinId) => {
        const result = await db_1.db.query('SELECT * FROM "Twin" WHERE id = $1', [twinId]);
        return result.rows[0];
    }
};
exports.chatQueries = {
    create: async (userId, twinId) => {
        const id = generateId();
        const result = await db_1.db.query('INSERT INTO "Chat" (id, "userId", "twinId") VALUES ($1, $2, $3) RETURNING *', [id, userId, twinId]);
        return result.rows[0];
    },
    findByUserId: async (userId) => {
        const result = await db_1.db.query('SELECT * FROM "Chat" WHERE "userId" = $1', [userId]);
        return result.rows;
    }
};
exports.messageQueries = {
    create: async (chatId, sender, content, approved = false) => {
        const id = generateId();
        const result = await db_1.db.query('INSERT INTO "Message" (id, "chatId", sender, content, approved) VALUES ($1, $2, $3, $4, $5) RETURNING *', [id, chatId, sender, content, approved]);
        return result.rows[0];
    },
    findByChatId: async (chatId) => {
        const result = await db_1.db.query('SELECT * FROM "Message" WHERE "chatId" = $1 AND approved = true ORDER BY "createdAt" ASC', [chatId]);
        return result.rows;
    }
};
exports.otpQueries = {
    create: async (email, codeHash, expiresAt) => {
        const id = generateId();
        const result = await db_1.db.query('INSERT INTO "OTP" (id, email, "codeHash", "expiresAt") VALUES ($1, $2, $3, $4) RETURNING *', [id, email, codeHash, expiresAt]);
        return result.rows[0];
    },
    findByEmail: async (email) => {
        const result = await db_1.db.query('SELECT * FROM "OTP" WHERE email = $1 ORDER BY "createdAt" DESC LIMIT 1', [email]);
        return result.rows[0];
    },
    markAsUsed: async (id) => {
        const result = await db_1.db.query('UPDATE "OTP" SET used = true WHERE id = $1 RETURNING *', [id]);
        return result.rows[0];
    }
};
exports.publicTwinQueries = {
    makePublic: async (twinId, publicHandle, bio, profileImage) => {
        const result = await db_1.db.query('UPDATE "Twin" SET "isPublic" = true, "publicHandle" = $1, "bio" = $2, "profileImage" = $3 WHERE id = $4 RETURNING *', [publicHandle, bio || null, profileImage || null, twinId]);
        return result.rows[0];
    },
    makePrivate: async (twinId) => {
        const result = await db_1.db.query('UPDATE "Twin" SET "isPublic" = false, "publicHandle" = null WHERE id = $1 RETURNING *', [twinId]);
        return result.rows[0];
    },
    findByPublicHandle: async (publicHandle) => {
        const result = await db_1.db.query('SELECT t.*, u.handle as userHandle, u.name as userName FROM "Twin" t JOIN "User" u ON t."userId" = u.id WHERE t."publicHandle" = $1 AND t."isPublic" = true', [publicHandle]);
        return result.rows[0];
    },
    getPublicTwins: async (limit = 20, offset = 0) => {
        const result = await db_1.db.query(`SELECT t.*, u.handle as userHandle, u.name as userName 
       FROM "Twin" t 
       JOIN "User" u ON t."userId" = u.id 
       WHERE t."isPublic" = true 
       ORDER BY t."likeCount" DESC, t."chatCount" DESC, t."createdAt" DESC 
       LIMIT $1 OFFSET $2`, [limit, offset]);
        return result.rows;
    },
    updateProfile: async (twinId, bio, profileImage, publicHandle) => {
        const updates = [];
        const values = [];
        let paramCount = 1;
        if (bio !== undefined) {
            updates.push(`"bio" = $${paramCount}`);
            values.push(bio);
            paramCount++;
        }
        if (profileImage !== undefined) {
            updates.push(`"profileImage" = $${paramCount}`);
            values.push(profileImage);
            paramCount++;
        }
        if (publicHandle !== undefined) {
            updates.push(`"publicHandle" = $${paramCount}`);
            values.push(publicHandle);
            paramCount++;
        }
        if (updates.length === 0) {
            throw new Error('No fields to update');
        }
        values.push(twinId);
        const result = await db_1.db.query(`UPDATE "Twin" SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`, values);
        return result.rows[0];
    }
};
exports.twinLikeQueries = {
    create: async (twinId, userId) => {
        const id = generateId();
        const result = await db_1.db.query('INSERT INTO "TwinLike" (id, "twinId", "userId") VALUES ($1, $2, $3) RETURNING *', [id, twinId, userId]);
        await db_1.db.query('UPDATE "Twin" SET "likeCount" = "likeCount" + 1 WHERE id = $1', [twinId]);
        const { updateTwinPerformanceScores } = await Promise.resolve().then(() => __importStar(require('../services/twinPerformanceService')));
        updateTwinPerformanceScores(twinId).catch(err => logger_1.logger.warn('Performance score update failed for like:', err));
        return result.rows[0];
    },
    remove: async (twinId, userId) => {
        const result = await db_1.db.query('DELETE FROM "TwinLike" WHERE "twinId" = $1 AND "userId" = $2 RETURNING *', [twinId, userId]);
        if (result.rows.length > 0) {
            await db_1.db.query('UPDATE "Twin" SET "likeCount" = "likeCount" - 1 WHERE id = $1', [twinId]);
            const { updateTwinPerformanceScores } = await Promise.resolve().then(() => __importStar(require('../services/twinPerformanceService')));
            updateTwinPerformanceScores(twinId).catch(err => logger_1.logger.warn('Performance score update failed for unlike:', err));
        }
        return result.rows[0];
    },
    findByTwinAndUser: async (twinId, userId) => {
        const result = await db_1.db.query('SELECT * FROM "TwinLike" WHERE "twinId" = $1 AND "userId" = $2', [twinId, userId]);
        return result.rows[0];
    },
    getTwinLikes: async (twinId) => {
        const result = await db_1.db.query('SELECT COUNT(*) as count FROM "TwinLike" WHERE "twinId" = $1', [twinId]);
        return parseInt(result.rows[0].count);
    }
};
exports.twinFollowQueries = {
    create: async (twinId, userId) => {
        const id = generateId();
        const result = await db_1.db.query('INSERT INTO "TwinFollow" (id, "twinId", "userId") VALUES ($1, $2, $3) RETURNING *', [id, twinId, userId]);
        await db_1.db.query('UPDATE "Twin" SET "followCount" = "followCount" + 1 WHERE id = $1', [twinId]);
        const { updateTwinPerformanceScores } = await Promise.resolve().then(() => __importStar(require('../services/twinPerformanceService')));
        updateTwinPerformanceScores(twinId).catch(err => logger_1.logger.warn('Performance score update failed for follow:', err));
        return result.rows[0];
    },
    remove: async (twinId, userId) => {
        const result = await db_1.db.query('DELETE FROM "TwinFollow" WHERE "twinId" = $1 AND "userId" = $2 RETURNING *', [twinId, userId]);
        if (result.rows.length > 0) {
            await db_1.db.query('UPDATE "Twin" SET "followCount" = "followCount" - 1 WHERE id = $1', [twinId]);
            const { updateTwinPerformanceScores } = await Promise.resolve().then(() => __importStar(require('../services/twinPerformanceService')));
            updateTwinPerformanceScores(twinId).catch(err => logger_1.logger.warn('Performance score update failed for unfollow:', err));
        }
        return result.rows[0];
    },
    findByTwinAndUser: async (twinId, userId) => {
        const result = await db_1.db.query('SELECT * FROM "TwinFollow" WHERE "twinId" = $1 AND "userId" = $2', [twinId, userId]);
        return result.rows[0];
    },
    getTwinFollows: async (twinId) => {
        const result = await db_1.db.query('SELECT COUNT(*) as count FROM "TwinFollow" WHERE "twinId" = $1', [twinId]);
        return parseInt(result.rows[0].count);
    }
};
exports.publicChatQueries = {
    create: async (twinId, visitorId, userId) => {
        const id = generateId();
        logger_1.logger.info(`[publicChatQueries.create] Creating chat - Id: ${id}, TwinId: ${twinId}, UserId: ${userId || 'null'}, VisitorId: ${visitorId || 'null'}`);
        const result = await db_1.db.query('INSERT INTO "PublicChat" (id, "twinId", "visitorId", "userId") VALUES ($1, $2, $3, $4) RETURNING *', [id, twinId, visitorId || null, userId || null]);
        if (result && result.rows && result.rows[0]) {
            logger_1.logger.info(`[publicChatQueries.create] Chat created - Result userId: ${result.rows[0].userId || 'null'}`);
        }
        await db_1.db.query('UPDATE "Twin" SET "chatCount" = "chatCount" + 1 WHERE id = $1', [twinId]);
        const { updateTwinPerformanceScores } = await Promise.resolve().then(() => __importStar(require('../services/twinPerformanceService')));
        updateTwinPerformanceScores(twinId).catch(err => logger_1.logger.warn('Performance score update failed for chat creation:', err));
        return result?.rows?.[0];
    },
    updateMessageCount: async (chatId) => {
        const result = await db_1.db.query('UPDATE "PublicChat" SET "messageCount" = "messageCount" + 1, "lastActivity" = NOW() WHERE id = $1 RETURNING *', [chatId]);
        return result.rows[0];
    },
    findByTwinAndVisitor: async (twinId, visitorId) => {
        const result = await db_1.db.query('SELECT * FROM "PublicChat" WHERE "twinId" = $1 AND ("visitorId" = $2 OR ("visitorId" IS NULL AND $2 IS NULL)) ORDER BY "createdAt" DESC', [twinId, visitorId || null]);
        return result.rows;
    },
    findAllByTwinAndVisitor: async (twinId, visitorId) => {
        const result = await db_1.db.query('SELECT * FROM "PublicChat" WHERE "twinId" = $1 AND ("visitorId" = $2 OR ("visitorId" IS NULL AND $2 IS NULL)) ORDER BY "createdAt" DESC', [twinId, visitorId || null]);
        return result.rows;
    }
};
exports.publicMessageQueries = {
    create: async (chatId, sender, content) => {
        const id = generateId();
        const result = await db_1.db.query('INSERT INTO "PublicMessage" (id, "chatId", sender, content, approved) VALUES ($1, $2, $3, $4, $5) RETURNING *', [id, chatId, sender, content, true]);
        return result.rows[0];
    },
    findByChatId: async (chatId, limit = 50) => {
        const result = await db_1.db.query('SELECT * FROM "PublicMessage" WHERE "chatId" = $1 AND approved = true ORDER BY "createdAt" ASC LIMIT $2', [chatId, limit]);
        return result.rows;
    },
    getRecentMessages: async (chatId, limit = 10) => {
        const result = await db_1.db.query('SELECT content, sender, "createdAt" FROM "PublicMessage" WHERE "chatId" = $1 AND approved = true ORDER BY "createdAt" DESC LIMIT $2', [chatId, limit]);
        return result.rows.reverse();
    },
    updateMessageCount: async (chatId) => {
        const result = await db_1.db.query('UPDATE "PublicChat" SET "messageCount" = "messageCount" + 1, "lastActivity" = NOW() WHERE id = $1 RETURNING *', [chatId]);
        return result.rows[0];
    }
};
exports.styleAnchorsQueries = {
    create: async (twinId, userUtterance, idealReply, tags = [], type = 'interaction', phrase, patternType, context) => {
        const id = generateId();
        const result = await db_1.db.query('INSERT INTO "style_anchors" (id, twin_id, user_utterance, ideal_reply, tags, type, phrase, pattern_type, context) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *', [id, twinId, userUtterance, idealReply, tags, type, phrase || null, patternType || null, context || null]);
        return result.rows[0];
    },
    findByTwinId: async (twinId, limit = 10, offset = 0) => {
        const result = await db_1.db.query('SELECT * FROM "style_anchors" WHERE twin_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [twinId, limit, offset]);
        return result.rows;
    },
    findById: async (anchorId) => {
        const result = await db_1.db.query('SELECT * FROM "style_anchors" WHERE id = $1', [anchorId]);
        return result.rows[0];
    },
    update: async (anchorId, userUtterance, idealReply, tags, type, phrase, patternType, context) => {
        const updates = [];
        const values = [];
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
        const result = await db_1.db.query(query, values);
        return result.rows[0];
    },
    delete: async (anchorId) => {
        const result = await db_1.db.query('DELETE FROM "style_anchors" WHERE id = $1 RETURNING *', [anchorId]);
        return result.rows[0];
    },
    findByTwinAndSimilarity: async (twinId, userMessage, limit = 2, type) => {
        let query = `
      SELECT *, 
       similarity(user_utterance, $2::text) as sim_score 
       FROM "style_anchors" 
       WHERE twin_id = $1`;
        const params = [twinId, userMessage];
        if (!type) {
            query += ` AND type = 'interaction'`;
        }
        else {
            query += ` AND type = $${params.length + 1}`;
            params.push(type);
        }
        query += ` ORDER BY sim_score DESC LIMIT $${params.length + 1}`;
        params.push(limit);
        try {
            const result = await db_1.db.query(query, params);
            return result.rows;
        }
        catch (error) {
            if (error.code === '42883' || error.message?.includes('similarity') || error.message?.includes('does not exist')) {
                logger_1.logger.warn('Similarity function not available, falling back to recency-based search', {
                    error: error.message,
                    twinId,
                    userMessage
                });
                let fallbackQuery = `
          SELECT *, 0.5 as sim_score 
          FROM "style_anchors" 
          WHERE twin_id = $1`;
                const fallbackParams = [twinId];
                if (!type) {
                    fallbackQuery += ` AND type = 'interaction'`;
                }
                else {
                    fallbackQuery += ` AND type = $2`;
                    fallbackParams.push(type);
                }
                fallbackQuery += ` ORDER BY created_at DESC LIMIT $${fallbackParams.length + 1}`;
                fallbackParams.push(limit);
                const result = await db_1.db.query(fallbackQuery, fallbackParams);
                return result.rows;
            }
            throw error;
        }
    },
    findPhrasesByTwinId: async (twinId, limit = 5) => {
        const result = await db_1.db.query('SELECT * FROM "style_anchors" WHERE twin_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT $3', [twinId, 'phrase', limit]);
        return result.rows;
    },
};
exports.memChunksQueries = {
    create: async (twinId, bucket, text, embedding) => {
        const id = generateId();
        const result = await db_1.db.query('INSERT INTO "mem_chunks" (id, twin_id, bucket, text, embedding) VALUES ($1, $2, $3, $4, $5) RETURNING *', [id, twinId, bucket, text, embedding ? JSON.stringify(embedding) : null]);
        return result.rows[0];
    },
    findByTwinAndBucket: async (twinId, bucket, limit = 10) => {
        const result = await db_1.db.query('SELECT * FROM "mem_chunks" WHERE twin_id = $1 AND bucket = $2 ORDER BY ts DESC LIMIT $3', [twinId, bucket, limit]);
        return result.rows;
    },
    findByTwinAndSimilarity: async (twinId, bucket, queryEmbedding, limit = 3) => {
        const result = await db_1.db.query(`SELECT *, 
       embedding <-> $3 as distance 
       FROM "mem_chunks" 
       WHERE twin_id = $1 AND bucket = $2 
       ORDER BY distance ASC 
       LIMIT $4`, [twinId, bucket, JSON.stringify(queryEmbedding), limit]);
        return result.rows;
    },
    delete: async (chunkId) => {
        const result = await db_1.db.query('DELETE FROM "mem_chunks" WHERE id = $1 RETURNING *', [chunkId]);
        return result.rows[0];
    },
    update: async (chunkId, text) => {
        const result = await db_1.db.query('UPDATE "mem_chunks" SET text = $1 WHERE id = $2 RETURNING *', [text, chunkId]);
        return result.rows[0];
    },
    findByTwinIdAndBucket: async (twinId, bucket, limit = 10, offset = 0) => {
        const result = await db_1.db.query('SELECT * FROM "mem_chunks" WHERE twin_id = $1 AND bucket = $2 ORDER BY ts DESC LIMIT $3 OFFSET $4', [twinId, bucket, limit, offset]);
        return result.rows;
    },
};
exports.styleCorrectionsQueries = {
    create: async (twinId, knob, delta, source) => {
        const id = generateId();
        const result = await db_1.db.query('INSERT INTO "style_corrections" (id, twin_id, knob, delta, source) VALUES ($1, $2, $3, $4, $5) RETURNING *', [id, twinId, knob, delta, source]);
        return result.rows[0];
    },
    findByTwinId: async (twinId, limit = 50) => {
        const result = await db_1.db.query('SELECT * FROM "style_corrections" WHERE twin_id = $1 ORDER BY ts DESC LIMIT $2', [twinId, limit]);
        return result.rows;
    },
    getAggregatedCorrections: async (twinId) => {
        const result = await db_1.db.query(`SELECT knob, SUM(delta) as total_delta, COUNT(*) as correction_count 
       FROM "style_corrections" 
       WHERE twin_id = $1 
       GROUP BY knob`, [twinId]);
        return result.rows;
    }
};
exports.aiRunsQueries = {
    create: async (twinId, mode, tokensIn, tokensOut, criticScore, regen = false, latencyMs) => {
        const id = generateId();
        const result = await db_1.db.query('INSERT INTO "ai_runs" (id, twin_id, mode, tokens_in, tokens_out, critic_score, regen, latency_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *', [id, twinId, mode, tokensIn, tokensOut, criticScore, regen, latencyMs]);
        return result.rows[0];
    },
    findByTwinId: async (twinId, limit = 100, offset = 0) => {
        const result = await db_1.db.query('SELECT * FROM "ai_runs" WHERE twin_id = $1 ORDER BY ts DESC LIMIT $2 OFFSET $3', [twinId, limit, offset]);
        return result.rows;
    },
    getQualityMetrics: async (twinId, days = 7) => {
        const result = await db_1.db.query(`SELECT 
         AVG(critic_score) as avg_critic_score,
         COUNT(*) as total_runs,
         COUNT(CASE WHEN critic_score >= 80 THEN 1 END) as high_quality_runs,
         AVG(latency_ms) as avg_latency,
         AVG(tokens_in) as avg_tokens_in,
         AVG(tokens_out) as avg_tokens_out
       FROM "ai_runs" 
       WHERE twin_id = $1 AND ts >= NOW() - INTERVAL '${days} days'`, [twinId]);
        return result.rows[0];
    },
    getRecentRuns: async (twinId, hours = 24) => {
        const result = await db_1.db.query('SELECT * FROM "ai_runs" WHERE twin_id = $1 AND ts >= NOW() - INTERVAL \'$2 hours\' ORDER BY ts DESC', [twinId, hours]);
        return result.rows;
    }
};
exports.memorySessionQueries = {
    create: async (chatId, summary, keyTopics, vector) => {
        const id = `mem_sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const result = await db_1.db.query(`INSERT INTO "MemorySession" (id, "chatId", summary, "keyTopics", vector, "messageCount", "lastUpdated")
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`, [id, chatId, summary, keyTopics, JSON.stringify(vector), 0]);
        return result.rows[0];
    },
    findByChatId: async (chatId) => {
        const result = await db_1.db.query('SELECT * FROM "MemorySession" WHERE "chatId" = $1', [chatId]);
        return result.rows[0] || null;
    },
    update: async (chatId, summary, keyTopics, vector, messageCount) => {
        const result = await db_1.db.query(`UPDATE "MemorySession" 
       SET summary = $1, "keyTopics" = $2, vector = $3, "messageCount" = $4, "lastUpdated" = NOW()
       WHERE "chatId" = $5
       RETURNING *`, [summary, keyTopics, JSON.stringify(vector), messageCount, chatId]);
        return result.rows[0];
    }
};
exports.memoryLongTermQueries = {
    create: async (twinId, key, value, category, source = 'session') => {
        const id = `mem_lt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const result = await db_1.db.query(`INSERT INTO "MemoryLongTerm" (id, "twinId", key, value, category, source, "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT ("twinId", key) 
       DO UPDATE SET value = EXCLUDED.value, category = EXCLUDED.category, "updatedAt" = NOW()
       RETURNING *`, [id, twinId, key, value, category, source]);
        return result.rows[0];
    },
    findByTwinId: async (twinId, category, limit = 10) => {
        let query = 'SELECT * FROM "MemoryLongTerm" WHERE "twinId" = $1';
        const params = [twinId];
        if (category) {
            query += ' AND category = $2';
            params.push(category);
            query += ' ORDER BY "updatedAt" DESC LIMIT $3';
            params.push(limit);
        }
        else {
            query += ' ORDER BY "updatedAt" DESC LIMIT $2';
            params.push(limit);
        }
        const result = await db_1.db.query(query, params);
        return result.rows;
    },
    delete: async (twinId, key) => {
        const result = await db_1.db.query('DELETE FROM "MemoryLongTerm" WHERE "twinId" = $1 AND key = $2 RETURNING *', [twinId, key]);
        return result.rows[0];
    }
};
//# sourceMappingURL=database.js.map