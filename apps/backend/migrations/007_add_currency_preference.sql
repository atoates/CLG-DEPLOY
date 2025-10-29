-- Add currency preference to user_prefs table
ALTER TABLE user_prefs 
ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_prefs_currency ON user_prefs(currency);
