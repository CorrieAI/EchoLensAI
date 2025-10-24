-- Add source column to terms table
-- This column tracks whether a term was auto-extracted or manually created

ALTER TABLE terms ADD COLUMN IF NOT EXISTS source VARCHAR DEFAULT 'auto';

-- Set existing terms to 'auto' source
UPDATE terms SET source = 'auto' WHERE source IS NULL;

-- Add comment
COMMENT ON COLUMN terms.source IS 'Source of the term: auto (AI extracted) or manual (user created)';
