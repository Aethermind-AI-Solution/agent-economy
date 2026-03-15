-- Migration 003: Sprint 1 infrastructure fixes
-- Adds: rate limit table, idempotency cache, refund_escrow, idempotent create_escrow

-- ============================================================
-- 1. Supabase-backed rate limiter
--    Replaces the broken in-memory Map in rate-limit.ts.
--    Each row = (key, window_start bucket) with a request count.
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_rate_limits (
  key           TEXT NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key TEXT,
  p_window_start TIMESTAMPTZ,
  p_limit INTEGER
) RETURNS JSONB LANGUAGE plpgsql AS $fn$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO agent_rate_limits (key, window_start, request_count)
  VALUES (p_key, p_window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET request_count = agent_rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN jsonb_build_object('allowed', v_count <= p_limit, 'count', v_count);
END;
$fn$;


-- ============================================================
-- 2. Idempotency cache for message route retries
--    Key = "{conv_id}:{message_type}:{idempotency_key}"
--    Prevents double-escrow on client timeout + retry.
-- ============================================================

CREATE TABLE IF NOT EXISTS idempotency_cache (
  key        TEXT PRIMARY KEY,
  response   JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 3. Idempotent create_escrow
--    If escrow is already set on a conversation, bail out safely.
--    Prevents double-deduction on serial retries.
-- ============================================================

CREATE OR REPLACE FUNCTION create_escrow(
  p_conversation_id UUID,
  p_buyer_id UUID,
  p_amount DECIMAL(10,2)
)
RETURNS JSONB AS $fn$
DECLARE
  v_buyer_balance DECIMAL(10,2);
  v_fee DECIMAL(10,2);
BEGIN
  -- Idempotency: if escrow already set, return success without re-deducting
  IF EXISTS (
    SELECT 1 FROM conversations
    WHERE id = p_conversation_id
      AND escrow_amount IS NOT NULL
      AND escrow_amount > 0
  ) THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true);
  END IF;

  -- Advisory lock on buyer to prevent concurrent balance races
  PERFORM pg_advisory_xact_lock(hashtext(p_buyer_id::text));

  -- Get current balance
  SELECT balance INTO v_buyer_balance
    FROM agents WHERE id = p_buyer_id FOR UPDATE;

  IF v_buyer_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Buyer not found');
  END IF;

  IF v_buyer_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Insufficient balance. Required: $%s, Available: $%s',
        p_amount::text, v_buyer_balance::text)
    );
  END IF;

  -- Calculate platform fee (5%)
  v_fee := round(p_amount * 0.05, 2);

  -- Deduct buyer balance
  UPDATE agents SET balance = balance - p_amount WHERE id = p_buyer_id;

  -- Set escrow on conversation
  UPDATE conversations
    SET escrow_amount = p_amount,
        platform_fee = v_fee
    WHERE id = p_conversation_id;

  RETURN jsonb_build_object('success', true);
END;
$fn$ LANGUAGE plpgsql;


-- ============================================================
-- 4. refund_escrow — returns locked funds to buyer
--    Used by admin dispute resolution (Release → Buyer)
-- ============================================================

CREATE OR REPLACE FUNCTION refund_escrow(p_conversation_id UUID)
RETURNS JSONB LANGUAGE plpgsql AS $fn$
DECLARE
  v_escrow   DECIMAL(10,2);
  v_buyer_id UUID;
BEGIN
  SELECT escrow_amount, buyer_id
    INTO v_escrow, v_buyer_id
    FROM conversations
    WHERE id = p_conversation_id
    FOR UPDATE;

  IF v_escrow IS NULL OR v_escrow = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No escrow to refund');
  END IF;

  UPDATE agents SET balance = balance + v_escrow WHERE id = v_buyer_id;

  UPDATE conversations
    SET escrow_amount = 0,
        escrow_frozen = false,
        status = 'rejected',
        updated_at = now()
    WHERE id = p_conversation_id;

  RETURN jsonb_build_object('success', true, 'refunded', v_escrow);
END;
$fn$;


-- ============================================================
-- 5. Cleanup policy for cron job
--    The expire-conversations cron also deletes old rows here.
--    These DELETEs are run by the cron handler, not here.
-- ============================================================
-- (No SQL needed — handled in /api/cron/expire-conversations)
