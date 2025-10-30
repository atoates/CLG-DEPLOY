-- Create logo cache table for persistent storage
CREATE TABLE IF NOT EXISTS logo_cache (
  symbol TEXT PRIMARY KEY,
  image_data BYTEA NOT NULL,
  content_type TEXT NOT NULL,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_logo_cache_updated_at ON logo_cache(updated_at);
