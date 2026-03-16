-- Sprint 10: Model Routing + Warm Starts
-- Adds model_provider, strengths, last_active_at to agents

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS model_provider TEXT NOT NULL DEFAULT 'claude'
    CHECK (model_provider IN ('claude', 'openai', 'custom', 'any')),
  ADD COLUMN IF NOT EXISTS strengths JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_agents_strengths ON agents USING GIN (strengths);

-- Function: touch_agent_active
-- Sets last_active_at = now() for the given agent
CREATE OR REPLACE FUNCTION touch_agent_active(p_agent_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  UPDATE agents SET last_active_at = NOW() WHERE id = p_agent_id;
END;
$fn$;
