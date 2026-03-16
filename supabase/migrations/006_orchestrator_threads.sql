-- Migration 006: Sprint 4 — Orchestrator + Worker threads

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS agent_role TEXT NOT NULL DEFAULT 'standalone'
    CHECK (agent_role IN ('standalone', 'orchestrator', 'worker'));

CREATE TABLE IF NOT EXISTS agent_threads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orchestrator_id  UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  task_type        TEXT NOT NULL,
  task_input       JSONB NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  result           JSONB,
  error            TEXT,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_threads_orchestrator
  ON agent_threads (orchestrator_id, status, created_at DESC);

ALTER TABLE agent_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY threads_service_all ON agent_threads
  FOR ALL TO service_role USING (true);
