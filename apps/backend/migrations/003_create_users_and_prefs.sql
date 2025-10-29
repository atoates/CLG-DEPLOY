-- Create users and user_prefs tables if not exist
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                 -- internal uid (cookie)
  google_id TEXT UNIQUE,               -- Google sub
  email TEXT,
  name TEXT,
  avatar TEXT,
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);

CREATE TABLE IF NOT EXISTS user_prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  watchlist_json TEXT NOT NULL DEFAULT '[]',
  severity_json  TEXT NOT NULL DEFAULT '["critical","warning","info"]',
  show_all       INTEGER NOT NULL DEFAULT 0,
  dismissed_json TEXT NOT NULL DEFAULT '[]',
  updated_at     BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);