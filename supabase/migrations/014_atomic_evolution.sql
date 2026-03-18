-- Migration 014: atomic evolution_version increment
--
-- Replaces the two-step read-then-write in evolveAgent() with a single
-- atomic DB function, preventing version corruption when two crew runs
-- finish close together and both trigger evolution simultaneously.

CREATE OR REPLACE FUNCTION increment_evolution_version(
  p_agent_id    uuid,
  p_meta_strategy jsonb,
  p_evolved_at  timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_new_version integer;
BEGIN
  UPDATE agents
  SET
    evolution_version = COALESCE(evolution_version, 0) + 1,
    meta_strategy     = p_meta_strategy,
    last_evolved_at   = p_evolved_at
  WHERE id = p_agent_id
  RETURNING evolution_version INTO v_new_version;

  RETURN v_new_version;
END;
$fn$;
