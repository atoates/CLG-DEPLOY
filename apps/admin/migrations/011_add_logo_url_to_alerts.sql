-- Add logo_url column to alerts table to cache token logos
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Create index for faster lookups by token
CREATE INDEX IF NOT EXISTS idx_alerts_token ON alerts(token);
