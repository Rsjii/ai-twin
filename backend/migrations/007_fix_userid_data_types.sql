-- Fix userId data types in ChatFeedback and AILearning tables
-- Change from INTEGER to TEXT to match User table schema

-- Fix ChatFeedback table
ALTER TABLE "ChatFeedback" ALTER COLUMN "userId" TYPE TEXT;

-- Fix AILearning table  
ALTER TABLE "AILearning" ALTER COLUMN "userId" TYPE TEXT;
ALTER TABLE "AILearning" ALTER COLUMN "twinId" TYPE TEXT;