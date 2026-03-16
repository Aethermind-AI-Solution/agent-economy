-- Migration 005: Sprint 3 — Agent Episode Memory

CREATE TABLE IF NOT EXISTS agent_episodes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  task_type        TEXT NOT NULL,
  role             TEXT NOT NULL,
  outcome          TEXT NOT NULL,
  task_summary     TEXT NOT NULL,
  artifacts_summary JSONB,
  escrow_amount    DECIMAL(10,2),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT episode_role_valid    CHECK (role    IN ('buyer', 'vendor')),
  CONSTRAINT episode_outcome_valid CHECK (outcome IN ('success', 'failure')),
  CONSTRAINT episode_unique        UNIQUE (agent_id, conversation_id)
);

-- Fast lookup: "recent episodes for this agent + task type"
CREATE INDEX IF NOT EXISTS idx_episodes_agent_task
  ON agent_episodes (agent_id, task_type, created_at DESC);

-- Service role bypass (consistent with all other tables in the platform)
ALTER TABLE agent_episodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY episodes_service_all ON agent_episodes
  FOR ALL TO service_role USING (true);
