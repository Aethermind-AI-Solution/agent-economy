-- Sprint 9: Self-Evolving Agents
-- Agents store learned behaviors and strategies that improve over time

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS meta_strategy JSONB,
  ADD COLUMN IF NOT EXISTS evolution_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_evolved_at TIMESTAMPTZ;
