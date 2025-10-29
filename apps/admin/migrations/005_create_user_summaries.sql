-- Store AI summary responses per user (only for logged-in users)
CREATE TABLE IF NOT EXISTS user_summaries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  model TEXT,
  tokens_json TEXT NOT NULL DEFAULT '[]',
  sev_filter_json TEXT NOT NULL DEFAULT '[]',
  tag_filter_json TEXT NOT NULL DEFAULT '[]',
  alert_ids_json TEXT NOT NULL DEFAULT '[]',
  content TEXT NOT NULL,
  usage_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_summaries_user_created ON user_summaries(user_id, created_at DESC);
