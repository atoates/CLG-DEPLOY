-- Create news feeds table for managing multiple RSS feeds
CREATE TABLE IF NOT EXISTS news_feeds (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  feed_type TEXT DEFAULT 'rss',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_fetched_at TIMESTAMP,
  article_count INTEGER DEFAULT 0
);

-- Insert default CoinDesk feed
INSERT INTO news_feeds (name, url, feed_type, enabled, article_count)
VALUES ('CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/', 'rss', true, 0)
ON CONFLICT (url) DO NOTHING;
