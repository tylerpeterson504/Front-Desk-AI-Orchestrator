-- Refresh-token sessions.
--
-- Access tokens stay stateless and short-lived; long-lived state lives here so a
-- session can actually be revoked. Only a SHA-256 hash of each token is stored,
-- so a database leak does not hand over usable sessions.
--
-- `family_id` groups a rotation chain. Presenting an already-rotated token means
-- either a replay or a stolen token, and the whole family is revoked.

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    CHAR(64)     NOT NULL UNIQUE,
  family_id     UUID         NOT NULL,
  expires_at    TIMESTAMPTZ  NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  rotated_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  revoked_reason TEXT,
  client        TEXT
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens (family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens (expires_at);
