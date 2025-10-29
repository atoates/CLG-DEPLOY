-- Migration 009: Add alert_created tracking to news_cache
-- This allows tracking which news articles have been converted to alerts

-- Add alert_created column (defaults to FALSE for existing rows)
ALTER TABLE news_cache 
ADD COLUMN IF NOT EXISTS alert_created BOOLEAN DEFAULT FALSE;

-- Add index for faster filtering queries
CREATE INDEX IF NOT EXISTS idx_news_cache_alert_created 
ON news_cache(alert_created);

-- Optional: Mark existing articles that already have alerts created from them
-- This finds alerts where source_url matches article_url
UPDATE news_cache 
SET alert_created = TRUE 
WHERE alert_created = FALSE
  AND article_url IN (
    SELECT DISTINCT source_url 
    FROM alerts 
    WHERE source_url IS NOT NULL 
      AND source_url != ''
  );

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 009 completed: alert_created column added to news_cache';
END $$;
