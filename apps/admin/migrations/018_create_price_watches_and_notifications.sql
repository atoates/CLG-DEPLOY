-- Price watch thresholds: user sets alerts like "tell me if ETH drops below $2800"
CREATE TABLE IF NOT EXISTS price_watches (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('above', 'below', 'change_pct')),
  threshold   NUMERIC NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  triggered   BOOLEAN NOT NULL DEFAULT FALSE,
  triggered_at BIGINT,
  triggered_price NUMERIC,
  created_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);
CREATE INDEX IF NOT EXISTS idx_price_watches_user ON price_watches(user_id);
CREATE INDEX IF NOT EXISTS idx_price_watches_active ON price_watches(active) WHERE active = TRUE;

-- User notifications: portfolio watchdog alerts, price triggers, digest ready, etc.
CREATE TABLE IF NOT EXISTS user_notifications (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('portfolio_alert', 'price_trigger', 'digest_ready', 'general')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  data        JSONB NOT NULL DEFAULT '{}',
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread ON user_notifications(user_id, read) WHERE read = FALSE;
