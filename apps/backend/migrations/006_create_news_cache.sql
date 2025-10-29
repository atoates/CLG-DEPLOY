-- News cache table for storing fetched news articles
-- Reduces API calls by caching news for 120 days
CREATE TABLE IF NOT EXISTS news_cache (
  id SERIAL PRIMARY KEY,
  article_url TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  text TEXT,
  source_name TEXT,
  date TIMESTAMP,
  sentiment TEXT,
  tickers TEXT,  -- JSON array as TEXT
  topics TEXT,   -- JSON array as TEXT
  image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '120 days'
);

-- Index for expiration cleanup queries
CREATE INDEX IF NOT EXISTS idx_news_expires 
ON news_cache(expires_at);

-- GIN index for fast ticker-based JSON searches
CREATE INDEX IF NOT EXISTS idx_news_tickers 
ON news_cache USING gin((tickers::jsonb));

-- Index for date sorting
CREATE INDEX IF NOT EXISTS idx_news_date 
ON news_cache(date DESC);
