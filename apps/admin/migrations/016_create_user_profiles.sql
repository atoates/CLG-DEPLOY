-- User profiles: persistent memory for Sentinel AI
-- Stores structured profile data extracted from conversations + onboarding
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Structured profile fields (JSONB for flexible querying)
  holdings       JSONB NOT NULL DEFAULT '[]',        -- [{token, note}] e.g. [{token:"ETH", note:"main holding"}, {token:"SOL", note:"staking"}]
  experience     TEXT  NOT NULL DEFAULT 'unknown',    -- beginner | intermediate | advanced | unknown
  risk_tolerance TEXT  NOT NULL DEFAULT 'unknown',    -- conservative | moderate | aggressive | unknown
  interests      JSONB NOT NULL DEFAULT '[]',        -- ["defi","nfts","staking","privacy","layer2"] etc.
  exchanges      JSONB NOT NULL DEFAULT '[]',        -- ["coinbase","binance"] etc.
  wallets        JSONB NOT NULL DEFAULT '[]',        -- ["metamask","ledger","phantom"] etc.
  goals          TEXT  NOT NULL DEFAULT '',            -- free-text: what they want from crypto
  concerns       TEXT  NOT NULL DEFAULT '',            -- free-text: what worries them
  notes          JSONB NOT NULL DEFAULT '[]',        -- [{t, note}] freeform observations from conversations
  -- Onboarding state
  onboarded      BOOLEAN NOT NULL DEFAULT FALSE,
  onboard_step   INTEGER NOT NULL DEFAULT 0,          -- which onboarding question we're up to (0 = not started)
  -- Timestamps
  created_at     BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_at     BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())
);

-- Index for quick lookups by experience/risk for potential future analytics
CREATE INDEX IF NOT EXISTS idx_user_profiles_experience ON user_profiles(experience);
CREATE INDEX IF NOT EXISTS idx_user_profiles_risk ON user_profiles(risk_tolerance);
