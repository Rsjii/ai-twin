-- Migration: Enhance Style Anchors Table
-- Adds support for phrases and patterns (not just interactions)

-- Add type column with constraint
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'style_anchors' AND column_name = 'type'
  ) THEN
    ALTER TABLE "style_anchors" 
    ADD COLUMN "type" TEXT DEFAULT 'interaction';
    
    -- Add check constraint
    ALTER TABLE "style_anchors" 
    ADD CONSTRAINT "style_anchors_type_check" 
    CHECK ("type" IN ('interaction', 'phrase', 'pattern'));
  END IF;
END $$;

-- Add phrase column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'style_anchors' AND column_name = 'phrase'
  ) THEN
    ALTER TABLE "style_anchors"
    ADD COLUMN "phrase" TEXT;
  END IF;
END $$;

-- Add pattern_type column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'style_anchors' AND column_name = 'pattern_type'
  ) THEN
    ALTER TABLE "style_anchors"
    ADD COLUMN "pattern_type" TEXT;
  END IF;
END $$;

-- Add context column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'style_anchors' AND column_name = 'context'
  ) THEN
    ALTER TABLE "style_anchors"
    ADD COLUMN "context" TEXT;
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "idx_style_anchors_type" ON "style_anchors"("type");
CREATE INDEX IF NOT EXISTS "idx_style_anchors_twinid_type" ON "style_anchors"("twin_id", "type");

SELECT 'Style anchors table enhanced successfully!' as status;