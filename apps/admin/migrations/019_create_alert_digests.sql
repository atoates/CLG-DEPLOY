-- Weekly alert digests: auto-generated summaries of alerts relevant to user holdings
CREATE TABLE IF NOT EXISTS alert_digests (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start BIGINT NOT NULL,
  period_end   BIGINT NOT NULL,
  summary     TEXT NOT NULL DEFAULT '',
  alert_count INTEGER NOT NULL DEFAULT 0,
  tokens_covered JSONB NOT NULL DEFAULT '[]',
  severity_breakdown JSONB NOT NULL DEFAULT '{}',
  highlights  JSONB NOT NULL DEFAULT '[]',
  created_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);
CREATE INDEX IF NOT EXISTS idx_alert_digests_user ON alert_digests(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_digests_period ON alert_digests(user_id, period_end DESC);

-- Track which alerts have been seen by the watchdog for each user (avoid duplicate notifications)
CREATE TABLE IF NOT EXISTS user_alert_seen (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_id    TEXT NOT NULL,
  notified_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  PRIMARY KEY (user_id, alert_id)
);
