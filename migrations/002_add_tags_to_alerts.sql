-- Make sure alerts table exists before updating
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  deadline TEXT NOT NULL,
  tags TEXT DEFAULT '[]'
);

-- Add tags to existing alerts based on their severity
UPDATE alerts 
SET tags = CASE 
  WHEN severity = 'info' THEN '["community","news"]'
  WHEN severity = 'critical' THEN '["hack","exploit"]'
  WHEN severity = 'warning' THEN '["community","migration"]'
  ELSE '[]'
END;

-- Ensure tags is not NULL for any alerts
UPDATE alerts SET tags = '[]' WHERE tags IS NULL;