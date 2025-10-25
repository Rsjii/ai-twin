-- Create ChatFeedback table
CREATE TABLE IF NOT EXISTS "ChatFeedback" (
  "id" SERIAL PRIMARY KEY,
  "chatId" VARCHAR(255) NOT NULL,
  "responseId" VARCHAR(255) NOT NULL,
  "userId" INTEGER NOT NULL,
  "rating" VARCHAR(20) NOT NULL,
  "suggestion" TEXT,
  "tonePreference" VARCHAR(50),
  "createdAt" TIMESTAMP DEFAULT NOW(),
  UNIQUE("chatId", "responseId", "userId")
);

-- Create AILearning table
CREATE TABLE IF NOT EXISTS "AILearning" (
  "id" SERIAL PRIMARY KEY,
  "twinId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "learningData" JSONB,
  "lastUpdated" TIMESTAMP DEFAULT NOW(),
  UNIQUE("twinId")
);