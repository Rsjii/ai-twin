import { db } from './db';
import { logger } from './logger';
import { verifyTwinOwnership } from '../utils/twinUtils';
import { generateId as generateBackendId } from '../utils/idGenerator';

// SQL to create all tables
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
    "dob" DATE,
    "phone" TEXT,
    "bio" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "referralCode" TEXT,
    "personaData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHandleChangeAt" TIMESTAMPTZ NULL,
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
    "tier" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Twin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Chat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
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
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'User' AND indexname = 'User_referralCode_idx') THEN
        CREATE UNIQUE INDEX "User_referralCode_idx" ON "User"("referralCode");
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

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'updatedAt') THEN
        ALTER TABLE "User" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'updatedAt') THEN
        ALTER TABLE "Twin" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Twin' AND column_name = 'tier') THEN
        ALTER TABLE "Twin" ADD COLUMN "tier" VARCHAR(255);
    END IF;

    -- ✅ Add lastMessage to PublicChat to match Chat table structure
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PublicChat' AND column_name = 'lastMessage') THEN
        ALTER TABLE "PublicChat" ADD COLUMN "lastMessage" TEXT;
    END IF;

    -- ✅ Add updatedAt to PublicChat to match Chat table structure
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PublicChat' AND column_name = 'updatedAt') THEN
        ALTER TABLE "PublicChat" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
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
      'SELECT id, email, "passwordHash", handle, name, dob, phone, bio, active, "referralCode", "createdAt", "profileImage", "lastHandleChangeAt", "profileCompleted" FROM "User" WHERE email = $1',
      [email]
    );
    return result.rows[0];
  },

  findById: async (id: string) => {
    const result = await db.query(
      'SELECT id, email, "passwordHash", handle, name, dob, phone, bio, active, "referralCode", "createdAt", "profileImage" FROM "User" WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  findByReferralCode: async (referralCode: string) => {
    const result = await db.query(
      'SELECT id, email, "passwordHash", handle, name, dob, phone, bio, active, "referralCode", "createdAt", "profileImage" FROM "User" WHERE "referralCode" = $1',
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
    const trimmedDob = dob ? dob.trim() : null;
    const dobValue = trimmedDob && trimmedDob.length > 0 ? trimmedDob : null;
    
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
      [name, handle, dobValue, phone, bio, profileImage || null, email]
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
  create: async (email: string, codeHash: string, expiresAt: Date) => {
    const id = generateBackendId.otp();
    const result = await db.query(
      'INSERT INTO "OTP" (id, email, "codeHash", "expiresAt") VALUES ($1, $2, $3, $4) RETURNING *',
      [id, email, codeHash, expiresAt]
    );
    return result.rows[0];
  },

  findByEmail: async (email: string) => {
    const result = await db.query(
      'SELECT id, email, "codeHash", "expiresAt", "createdAt", used FROM "OTP" WHERE email = $1 ORDER BY "createdAt" DESC LIMIT 1',
      [email]
    );    
    return result.rows[0];
  },

  markAsUsed: async (id: string) => {
    const result = await db.query('UPDATE "OTP" SET used = true WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  },

  deleteByEmail: async (email: string) => {
  await db.query(`DELETE FROM "OTP" WHERE email = $1`, [email.toLowerCase()]);
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
    // Update like count
    await db.query('UPDATE "Twin" SET "likeCount" = "likeCount" + 1 WHERE id = $1', [twinId]);
    
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
    // Update like count
    if (result.rows.length > 0) {
      await db.query('UPDATE "Twin" SET "likeCount" = "likeCount" - 1 WHERE id = $1', [twinId]);
      
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
    // Update follow count
    await db.query('UPDATE "Twin" SET "followCount" = "followCount" + 1 WHERE id = $1', [twinId]);
    
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
    // Update follow count
    if (result.rows.length > 0) {
      await db.query('UPDATE "Twin" SET "followCount" = "followCount" - 1 WHERE id = $1', [twinId]);
      
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

