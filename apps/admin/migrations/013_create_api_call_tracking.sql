-- Create API call tracking table
CREATE TABLE IF NOT EXISTS api_call_tracking (
  id SERIAL PRIMARY KEY,
  service_name TEXT NOT NULL,
  endpoint TEXT,
  call_count INTEGER DEFAULT 0,
  last_called_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(service_name, endpoint)
);

-- Insert default services
INSERT INTO api_call_tracking (service_name, endpoint, call_count)
VALUES 
  ('CoinMarketCap', '/v1/cryptocurrency/quotes/latest', 0),
  ('CoinMarketCap', '/v1/cryptocurrency/info', 0),
  ('CoinDesk', '/rss', 0),
  ('CryptoNews', '/v1/news', 0),
  ('OpenAI', '/v1/chat/completions', 0),
  ('Anthropic', '/v1/messages', 0),
  ('xAI', '/v1/chat/completions', 0)
ON CONFLICT (service_name, endpoint) DO NOTHING;
