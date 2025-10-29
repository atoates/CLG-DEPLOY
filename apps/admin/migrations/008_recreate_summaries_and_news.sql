-- Re-create user_summaries and news_cache tables if they don't exist
-- This fixes the issue where ROLLBACK_006_005.sql was run but migrations still marked as applied

-- Re-create user_summaries table (from migration 005)
CREATE TABLE IF NOT EXISTS user_summaries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())),
  model TEXT,
  tokens_json TEXT DEFAULT '[]',
  sev_filter_json TEXT DEFAULT '[]',
  tag_filter_json TEXT DEFAULT '[]',
  alert_ids_json TEXT DEFAULT '[]',
  content TEXT,
  usage_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_summaries_user_id ON user_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_user_summaries_created_at ON user_summaries(created_at DESC);

-- Re-create news_cache table (from migration 006)
CREATE TABLE IF NOT EXISTS news_cache (
  article_url TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  text TEXT,
  source_name TEXT,
  date BIGINT,
  sentiment TEXT,
  tickers JSONB DEFAULT '[]'::jsonb,
  topics JSONB DEFAULT '[]'::jsonb,
  image_url TEXT,
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '120 days'),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_cache_date ON news_cache(date DESC);
CREATE INDEX IF NOT EXISTS idx_news_cache_expires ON news_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_news_cache_tickers ON news_cache USING GIN (tickers);
