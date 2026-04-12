-- Migration 015: Create alert_summaries table
--
-- Caches per-alert AI analyses so they're generated once and reused across all
-- users viewing the same alert. Every refresh inserts a new row (so we keep a
-- full history per model). The "current" summary for an alert is simply the
-- most recent row regardless of model.
--
-- Columns:
--   id              - stable identifier for the row
--   alert_id        - FK-ish reference to alerts.id (no hard FK to keep this
--                     migration independent of the alerts table shape)
--   content         - the generated markdown/text analysis
--   model           - which provider/model produced it (e.g. 'openai:gpt-4o-mini')
--   prompt_version  - bumped when the prompt-building logic changes so stale
--                     rows can be ignored by the app
--   source_hash     - hash of the alert fields that fed into the prompt; lets
--                     us detect when an alert has been edited and the cache
--                     should regenerate
--   generated_at    - unix epoch seconds, used as the "current" selector
--   generated_by_uid- the user (or 'system') whose refresh produced this row,
--                     handy for rate-limit / abuse tracking later

CREATE TABLE IF NOT EXISTS alert_summaries (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL,
  content TEXT NOT NULL,
  model TEXT,
  prompt_version INTEGER NOT NULL DEFAULT 1,
  source_hash TEXT,
  generated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())),
  generated_by_uid TEXT
);

CREATE INDEX IF NOT EXISTS idx_alert_summaries_alert_id
  ON alert_summaries(alert_id);

CREATE INDEX IF NOT EXISTS idx_alert_summaries_generated_at
  ON alert_summaries(generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_summaries_alert_generated
  ON alert_summaries(alert_id, generated_at DESC);
