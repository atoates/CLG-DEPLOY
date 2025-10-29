-- Add tags to existing alerts based on their severity
-- (table should already exist from migration 001)

UPDATE alerts 
SET tags = CASE 
  WHEN severity = 'info' THEN '["community","news"]'
  WHEN severity = 'critical' THEN '["hack","exploit"]'
  WHEN severity = 'warning' THEN '["community","migration"]'
  ELSE '[]'
END
WHERE tags IS NULL OR tags = '';

-- Add new columns for extended alert metadata (PostgreSQL 9.6+ supports IF NOT EXISTS)
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS further_info TEXT DEFAULT '';
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT '';
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT '';

-- Ensure tags is not NULL for any alerts
UPDATE alerts SET tags = '[]' WHERE tags IS NULL;