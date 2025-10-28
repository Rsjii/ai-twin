import { db } from './db';

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

export async function initializeDatabase() {
  try {
    console.log('Initializing database...');
    await db.query(createTablesSQL);
    console.log('Database initialized successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// Helper function to generate CUID-like IDs
export function generateId(): string {
  return 'c' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// Database utility functions
export const userQueries = {
  create: async (email: string, handle?: string, passwordHash?: string, referralCode?: string) => {
    const id = generateId();
    const now = new Date();
    const result = await db.query(
      'INSERT INTO "User" (id, email, handle, "passwordHash", "referralCode", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [id, email, handle, passwordHash, referralCode, now, now]
    );
    return result.rows[0];
  },

  findByEmail: async (email: string) => {
    const result = await db.query('SELECT * FROM "User" WHERE email = $1', [email]);
    return result.rows[0];
  },

  findById: async (id: string) => {
    const result = await db.query('SELECT * FROM "User" WHERE id = $1', [id]);
    return result.rows[0];
  },

  findByReferralCode: async (referralCode: string) => {
    const result = await db.query('SELECT * FROM "User" WHERE "referralCode" = $1', [referralCode]);
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

  updateProfile: async (email: string, name: string, handle: string, dob: string, phone: string, bio: string, profileImage?: string | null) => {
    const result = await db.query(
      'UPDATE "User" SET name = $1, handle = $2, dob = $3, phone = $4, bio = $5, "profileImage" = $6 WHERE email = $7 RETURNING *',
      [name, handle, dob, phone, bio, profileImage || null, email]
    );
    return result.rows[0];
  }
};

export const twinQueries = {
  create: async (userId: string, styleVector: any, sampleReply?: string, instructions?: any) => {
    const id = generateId();
    const result = await db.query(
      'INSERT INTO "Twin" (id, "userId", "styleVector", "sampleReply", "instructions") VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, userId, JSON.stringify(styleVector), sampleReply, instructions ? JSON.stringify(instructions) : null]
    );
    return result.rows[0];
  },

  findByUserId: async (userId: string) => {
    const result = await db.query('SELECT * FROM "Twin" WHERE "userId" = $1', [userId]);
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
    const result = await db.query('SELECT * FROM "Twin" WHERE id = $1', [twinId]);
    return result.rows[0];
  }
};

export const chatQueries = {
  create: async (userId: string, twinId: string) => {
    const id = generateId();
    const result = await db.query(
      'INSERT INTO "Chat" (id, "userId", "twinId") VALUES ($1, $2, $3) RETURNING *',
      [id, userId, twinId]
    );
    return result.rows[0];
  },

  findByUserId: async (userId: string) => {
    const result = await db.query('SELECT * FROM "Chat" WHERE "userId" = $1', [userId]);
    return result.rows;
  }
};

export const messageQueries = {
  create: async (chatId: string, sender: 'human' | 'twin', content: string, approved = false) => {
    const id = generateId();
    const result = await db.query(
      'INSERT INTO "Message" (id, "chatId", sender, content, approved) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, chatId, sender, content, approved]
    );
    return result.rows[0];
  },

  findByChatId: async (chatId: string) => {
    const result = await db.query('SELECT * FROM "Message" WHERE "chatId" = $1 ORDER BY "createdAt" ASC', [chatId]);
    return result.rows;
  }
};

// Export db for direct use
export { db };

export const otpQueries = {
  create: async (email: string, codeHash: string, expiresAt: Date) => {
    const id = generateId();
    const result = await db.query(
      'INSERT INTO "OTP" (id, email, "codeHash", "expiresAt") VALUES ($1, $2, $3, $4) RETURNING *',
      [id, email, codeHash, expiresAt]
    );
    return result.rows[0];
  },

  findByEmail: async (email: string) => {
    const result = await db.query('SELECT * FROM "OTP" WHERE email = $1 ORDER BY "createdAt" DESC LIMIT 1', [email]);
    return result.rows[0];
  },

  markAsUsed: async (id: string) => {
    const result = await db.query('UPDATE "OTP" SET used = true WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  }
};

// Public Twin Queries
export const publicTwinQueries = {
  makePublic: async (twinId: string, publicHandle: string, bio?: string, profileImage?: string) => {
    const result = await db.query(
      'UPDATE "Twin" SET "isPublic" = true, "publicHandle" = $1, "bio" = $2, "profileImage" = $3 WHERE id = $4 RETURNING *',
      [publicHandle, bio || null, profileImage || null, twinId]
    );
    return result.rows[0];
  },

  makePrivate: async (twinId: string) => {
    const result = await db.query(
      'UPDATE "Twin" SET "isPublic" = false, "publicHandle" = null WHERE id = $1 RETURNING *',
      [twinId]
    );
    return result.rows[0];
  },

  findByPublicHandle: async (publicHandle: string) => {
    const result = await db.query(
      'SELECT t.*, u.handle as userHandle, u.name as userName FROM "Twin" t JOIN "User" u ON t."userId" = u.id WHERE t."publicHandle" = $1 AND t."isPublic" = true',
      [publicHandle]
    );
    return result.rows[0];
  },

  getPublicTwins: async (limit = 20, offset = 0) => {
    const result = await db.query(
      `SELECT t.*, u.handle as userHandle, u.name as userName 
       FROM "Twin" t 
       JOIN "User" u ON t."userId" = u.id 
       WHERE t."isPublic" = true 
       ORDER BY t."likeCount" DESC, t."chatCount" DESC, t."createdAt" DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  },

  updateProfile: async (twinId: string, bio?: string, profileImage?: string, publicHandle?: string) => {
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
    const result = await db.query(
      `UPDATE "Twin" SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0];
  }
};

// Twin Like Queries
export const twinLikeQueries = {
  create: async (twinId: string, userId: string) => {
    const id = generateId();
    const result = await db.query(
      'INSERT INTO "TwinLike" (id, "twinId", "userId") VALUES ($1, $2, $3) RETURNING *',
      [id, twinId, userId]
    );
    // Update like count
    await db.query('UPDATE "Twin" SET "likeCount" = "likeCount" + 1 WHERE id = $1', [twinId]);
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
    const id = generateId();
    const result = await db.query(
      'INSERT INTO "TwinFollow" (id, "twinId", "userId") VALUES ($1, $2, $3) RETURNING *',
      [id, twinId, userId]
    );
    // Update follow count
    await db.query('UPDATE "Twin" SET "followCount" = "followCount" + 1 WHERE id = $1', [twinId]);
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
  create: async (twinId: string, visitorId?: string) => {
    const id = generateId();
    const result = await db.query(
      'INSERT INTO "PublicChat" (id, "twinId", "visitorId") VALUES ($1, $2, $3) RETURNING *',
      [id, twinId, visitorId || null]
    );
    // Update chat count
    await db.query('UPDATE "Twin" SET "chatCount" = "chatCount" + 1 WHERE id = $1', [twinId]);
    return result.rows[0];
  },

  updateMessageCount: async (chatId: string) => {
    const result = await db.query(
      'UPDATE "PublicChat" SET "messageCount" = "messageCount" + 1, "lastActivity" = NOW() WHERE id = $1 RETURNING *',
      [chatId]
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

// ADD after line 582 (before the closing }):
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
    const id = generateId();
    const result = await db.query(
      'INSERT INTO "PublicMessage" (id, "chatId", sender, content, approved) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, chatId, sender, content, true]
    );
    return result.rows[0];
  },

  findByChatId: async (chatId: string, limit: number = 50) => {
    const result = await db.query(
      'SELECT * FROM "PublicMessage" WHERE "chatId" = $1 ORDER BY "createdAt" ASC LIMIT $2',
      [chatId, limit]
    );
    return result.rows;
  },

  getRecentMessages: async (chatId: string, limit: number = 10) => {
    const result = await db.query(
      'SELECT content, sender, "createdAt" FROM "PublicMessage" WHERE "chatId" = $1 ORDER BY "createdAt" DESC LIMIT $2',
      [chatId, limit]
    );
    return result.rows.reverse();
  },

  updateMessageCount: async (chatId: string) => {
    const result = await db.query(
      'UPDATE "PublicChat" SET "messageCount" = "messageCount" + 1, "lastActivity" = NOW() WHERE id = $1 RETURNING *',
      [chatId]
    );
    return result.rows[0];
  }
};

// Style Anchors Queries
export const styleAnchorsQueries = {
  create: async (twinId: string, userUtterance: string, idealReply: string, tags: string[] = []) => {
    const id = generateId();
    const result = await db.query(
      'INSERT INTO "style_anchors" (id, twin_id, user_utterance, ideal_reply, tags) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, twinId, userUtterance, idealReply, tags]
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

  update: async (anchorId: string, userUtterance: string, idealReply: string, tags: string[]) => {
    const result = await db.query(
      'UPDATE "style_anchors" SET user_utterance = $1, ideal_reply = $2, tags = $3 WHERE id = $4 RETURNING *',
      [userUtterance, idealReply, tags, anchorId]
    );
    return result.rows[0];
  },

  delete: async (anchorId: string) => {
    const result = await db.query('DELETE FROM "style_anchors" WHERE id = $1 RETURNING *', [anchorId]);
    return result.rows[0];
  },

  findByTwinAndSimilarity: async (twinId: string, userMessage: string, limit = 2) => {
    // This will be enhanced with vector similarity search later
    const result = await db.query(
      `SELECT *, 
       similarity(user_utterance, $2) as sim_score 
       FROM "style_anchors" 
       WHERE twin_id = $1 
       ORDER BY sim_score DESC 
       LIMIT $3`,
      [twinId, userMessage, limit]
    );
    return result.rows;
  }
};

// Memory Chunks Queries
export const memChunksQueries = {
  create: async (twinId: string, bucket: 'facts' | 'voice', text: string, embedding?: number[]) => {
    const id = generateId();
    const result = await db.query(
      'INSERT INTO "mem_chunks" (id, twin_id, bucket, text, embedding) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, twinId, bucket, text, embedding ? JSON.stringify(embedding) : null]
    );
    return result.rows[0];
  },

  findByTwinAndBucket: async (twinId: string, bucket: 'facts' | 'voice', limit = 10) => {
    const result = await db.query(
      'SELECT * FROM "mem_chunks" WHERE twin_id = $1 AND bucket = $2 ORDER BY ts DESC LIMIT $3',
      [twinId, bucket, limit]
    );
    return result.rows;
  },

  findByTwinAndSimilarity: async (twinId: string, bucket: 'facts' | 'voice', queryEmbedding: number[], limit = 3) => {
    // This will be enhanced with vector similarity search later
    const result = await db.query(
      `SELECT *, 
       embedding <-> $3 as distance 
       FROM "mem_chunks" 
       WHERE twin_id = $1 AND bucket = $2 
       ORDER BY distance ASC 
       LIMIT $4`,
      [twinId, bucket, JSON.stringify(queryEmbedding), limit]
    );
    return result.rows;
  },

  delete: async (chunkId: string) => {
    const result = await db.query('DELETE FROM "mem_chunks" WHERE id = $1 RETURNING *', [chunkId]);
    return result.rows[0];
  },

  // Add this function inside memChunksQueries object (around line 659)
update: async (chunkId: string, text: string) => {
  const result = await db.query(
    'UPDATE "mem_chunks" SET text = $1 WHERE id = $2 RETURNING *',
    [text, chunkId]
  );
  return result.rows[0];
},

  // Add this function to memChunksQueries object
findByTwinIdAndBucket: async (twinId: string, bucket: 'facts' | 'voice', limit = 10, offset = 0) => {
  const result = await db.query(
    'SELECT * FROM "mem_chunks" WHERE twin_id = $1 AND bucket = $2 ORDER BY ts DESC LIMIT $3 OFFSET $4',
    [twinId, bucket, limit, offset]
  );
  return result.rows;
},
};

// Style Corrections Queries
export const styleCorrectionsQueries = {
  create: async (twinId: string, knob: string, delta: number, source?: string) => {
    const id = generateId();
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
  create: async (twinId: string, mode: string, tokensIn: number, tokensOut: number, criticScore?: number, regen = false, latencyMs: number) => {
    const id = generateId();
    const result = await db.query(
      'INSERT INTO "ai_runs" (id, twin_id, mode, tokens_in, tokens_out, critic_score, regen, latency_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [id, twinId, mode, tokensIn, tokensOut, criticScore, regen, latencyMs]
    );
    return result.rows[0];
  },

  findByTwinId: async (twinId: string, limit = 100, offset = 0) => {
    const result = await db.query(
      'SELECT * FROM "ai_runs" WHERE twin_id = $1 ORDER BY ts DESC LIMIT $2 OFFSET $3',
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
       WHERE twin_id = $1 AND ts >= NOW() - INTERVAL '${days} days'`,
      [twinId]
    );
    return result.rows[0];
  },

  getRecentRuns: async (twinId: string, hours = 24) => {
    const result = await db.query(
      'SELECT * FROM "ai_runs" WHERE twin_id = $1 AND ts >= NOW() - INTERVAL \'$2 hours\' ORDER BY ts DESC',
      [twinId, hours]
    );
    return result.rows;
  }
};

