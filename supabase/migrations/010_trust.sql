-- Sprint 8: Trust & Reputation
-- Adds trust_score (computed) and min_buyer_trust (gating) to agents

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS trust_score DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS min_buyer_trust DECIMAL(4,2) NOT NULL DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_agents_trust_score ON agents (trust_score DESC);

-- Function: compute_trust_score
-- Formula: (reputation/5)*6 + min(tx,20)/20*4 - disputes*0.5, clamped 0-10
CREATE OR REPLACE FUNCTION compute_trust_score(p_agent_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_reputation DECIMAL;
  v_tx         INTEGER;
  v_disputes   INTEGER;
  v_score      DECIMAL;
BEGIN
  SELECT reputation_score, total_transactions
  INTO v_reputation, v_tx
  FROM agents
  WHERE id = p_agent_id;

  SELECT COUNT(*)
  INTO v_disputes
  FROM conversations
  WHERE (buyer_id = p_agent_id OR vendor_id = p_agent_id)
    AND status = 'disputed';

  v_score := (v_reputation / 5.0) * 6.0
           + (LEAST(v_tx, 20)::DECIMAL / 20.0) * 4.0
           - (v_disputes * 0.5);

  -- Clamp to [0, 10]
  v_score := GREATEST(0.0, LEAST(10.0, v_score));

  UPDATE agents SET trust_score = ROUND(v_score, 2) WHERE id = p_agent_id;
END;
$fn$;
