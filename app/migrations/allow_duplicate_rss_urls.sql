-- Migration: Allow multiple users to add the same podcast RSS URL
-- This enables backend deduplication while maintaining user-specific podcast ownership

-- Drop the unique constraint on rss_url
ALTER TABLE podcasts DROP CONSTRAINT IF EXISTS podcasts_rss_url_key;

-- Create a composite index for efficient lookups of user+rss_url combinations
CREATE INDEX IF NOT EXISTS idx_podcasts_user_rss ON podcasts(user_id, rss_url);

-- Add a comment explaining the design
COMMENT ON COLUMN podcasts.rss_url IS 'RSS feed URL - can be shared across users for backend deduplication of storage and processing';
