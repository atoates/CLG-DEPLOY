-- Add username column and enforce case-insensitive uniqueness
ALTER TABLE users ADD COLUMN username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase ON users (lower(username));
