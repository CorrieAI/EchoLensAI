-- Migration: Add User Authentication
-- Description: Add users, user_settings tables and add user_id to existing tables
-- Date: 2025-10-23

-- Step 1: Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Step 2: Create user_settings table
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    theme VARCHAR(20) NOT NULL DEFAULT 'system',
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Step 3: Add user_id to podcasts table
ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_podcasts_user_id ON podcasts(user_id);

-- Step 4: Add user_id to chats table
ALTER TABLE chats ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);

-- Step 5: Add user_id to playback_progress table
-- Note: Need to drop the unique constraint on episode_id first (multiple users can track same episode)
ALTER TABLE playback_progress DROP CONSTRAINT IF NOT EXISTS playback_progress_episode_id_key;
ALTER TABLE playback_progress ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_playback_progress_user_id ON playback_progress(user_id);

-- Step 6: Add user_id to notifications table
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- Step 7: Drop unique constraint on chats.episode_id (multiple users can chat with same episode)
ALTER TABLE chats DROP CONSTRAINT IF NOT EXISTS chats_episode_id_key;

-- Note: After running this migration, you should run the data migration script
-- to assign existing data to an admin user
