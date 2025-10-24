-- Add auto-download fields to podcasts table
-- Run with: docker exec echolens-postgres psql -U echolens -d echolens -f /app/migrations/add_auto_download_fields.sql

ALTER TABLE podcasts
ADD COLUMN IF NOT EXISTS auto_download INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS auto_download_limit INTEGER;

COMMENT ON COLUMN podcasts.auto_download IS '0 = disabled, 1 = enabled';
COMMENT ON COLUMN podcasts.auto_download_limit IS 'NULL = download all episodes, N = keep only N most recent episodes';
