-- Add referralCode column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'User' AND column_name = 'referralCode') THEN
        ALTER TABLE "User" ADD COLUMN "referralCode" TEXT UNIQUE;
    END IF;
END $$;

-- Create index if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes 
                   WHERE tablename = 'User' AND indexname = 'User_referralCode_idx') THEN
        CREATE INDEX "User_referralCode_idx" ON "User"("referralCode");
    END IF;
END $$;