"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.otpQueries = exports.db = exports.messageQueries = exports.chatQueries = exports.twinQueries = exports.userQueries = void 0;
exports.initializeDatabase = initializeDatabase;
exports.generateId = generateId;
const db_1 = require("./db");
Object.defineProperty(exports, "db", { enumerable: true, get: function () { return db_1.db; } });
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Twin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "styleVector" JSONB NOT NULL,
    "sampleReply" TEXT,
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

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_handle_key" ON "User"("handle");
CREATE UNIQUE INDEX IF NOT EXISTS "Invite_code_key" ON "Invite"("code");

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
    create: async (email, handle, passwordHash) => {
        const id = generateId();
        const result = await db_1.db.query('INSERT INTO "User" (id, email, handle, "passwordHash") VALUES ($1, $2, $3, $4) RETURNING *', [id, email, handle, passwordHash]);
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
    create: async (userId, styleVector, sampleReply) => {
        const id = generateId();
        const result = await db_1.db.query('INSERT INTO "Twin" (id, "userId", "styleVector", "sampleReply") VALUES ($1, $2, $3, $4) RETURNING *', [id, userId, JSON.stringify(styleVector), sampleReply]);
        return result.rows[0];
    },
    findByUserId: async (userId) => {
        const result = await db_1.db.query('SELECT * FROM "Twin" WHERE "userId" = $1', [userId]);
        return result.rows;
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
        const result = await db_1.db.query('SELECT * FROM "Message" WHERE "chatId" = $1 ORDER BY "createdAt" ASC', [chatId]);
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
//# sourceMappingURL=database.js.map