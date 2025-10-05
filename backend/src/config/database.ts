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
    "handle" TEXT,
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
  create: async (email: string, handle?: string) => {
    const id = generateId();
    const result = await db.query(
      'INSERT INTO "User" (id, email, handle) VALUES ($1, $2, $3) RETURNING *',
      [id, email, handle]
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
  }
};

export const twinQueries = {
  create: async (userId: string, styleVector: any, sampleReply?: string) => {
    const id = generateId();
    const result = await db.query(
      'INSERT INTO "Twin" (id, "userId", "styleVector", "sampleReply") VALUES ($1, $2, $3, $4) RETURNING *',
      [id, userId, JSON.stringify(styleVector), sampleReply]
    );
    return result.rows[0];
  },

  findByUserId: async (userId: string) => {
    const result = await db.query('SELECT * FROM "Twin" WHERE "userId" = $1', [userId]);
    return result.rows;
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
