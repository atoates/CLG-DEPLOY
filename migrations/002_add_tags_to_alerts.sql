CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  applied_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

UPDATE alerts SET tags = '["community","news"]' WHERE severity = 'info' AND tags IS NULL;
UPDATE alerts SET tags = '["hack","exploit"]' WHERE severity = 'critical' AND tags IS NULL;
UPDATE alerts SET tags = '["community","migration"]' WHERE severity = 'warning' AND tags IS NULL;