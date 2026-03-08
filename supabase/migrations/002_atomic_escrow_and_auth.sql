-- Migration 002: Atomic escrow, key prefix lookup, tx count increment
-- Fixes: race conditions, O(n) auth, broken tx counts, escrow freeze

-- ============================================================
-- 1. API key prefix column for O(1) auth lookup
-- ============================================================
-- Store first 20 chars of the raw API key for fast lookups.
-- Auth only needs to bcrypt-compare against 1 agent instead of all.

ALTER TABLE agents ADD COLUMN IF NOT EXISTS api_key_prefix TEXT;

-- Index for fast prefix lookups
CREATE INDEX IF NOT EXISTS idx_agents_key_prefix ON agents(api_key_prefix)
  WHERE api_key_prefix IS NOT NULL;

-- ============================================================
-- 2. Escrow frozen flag for disputes
-- ============================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS escrow_frozen BOOLEAN DEFAULT false;

-- ============================================================
-- 3. Atomic escrow creation (deduct buyer + lock escrow in one tx)
-- ============================================================
-- Uses advisory lock on buyer_id to prevent concurrent overdraw.

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
-- 4. Atomic escrow release (pay vendor + increment tx counts)
-- ============================================================

CREATE OR REPLACE FUNCTION release_escrow(
  p_conversation_id UUID
)
RETURNS JSONB AS $fn$
DECLARE
  v_escrow DECIMAL(10,2);
  v_fee DECIMAL(10,2);
  v_vendor_id UUID;
  v_buyer_id UUID;
  v_payout DECIMAL(10,2);
  v_frozen BOOLEAN;
BEGIN
  -- Lock the conversation row
  SELECT escrow_amount, platform_fee, vendor_id, buyer_id, escrow_frozen
    INTO v_escrow, v_fee, v_vendor_id, v_buyer_id, v_frozen
    FROM conversations
    WHERE id = p_conversation_id
    FOR UPDATE;

  IF v_escrow IS NULL OR v_escrow = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No escrow found');
  END IF;

  IF v_frozen THEN
    RETURN jsonb_build_object('success', false, 'error', 'Escrow is frozen due to dispute');
  END IF;

  v_payout := v_escrow - COALESCE(v_fee, 0);

  -- Credit vendor
  UPDATE agents
    SET balance = balance + v_payout,
        total_transactions = total_transactions + 1
    WHERE id = v_vendor_id;

  -- Increment buyer tx count
  UPDATE agents
    SET total_transactions = total_transactions + 1
    WHERE id = v_buyer_id;

  RETURN jsonb_build_object('success', true, 'payout', v_payout);
END;
$fn$ LANGUAGE plpgsql;


-- ============================================================
-- 5. Freeze escrow on dispute
-- ============================================================

CREATE OR REPLACE FUNCTION freeze_escrow(
  p_conversation_id UUID
)
RETURNS JSONB AS $fn$
BEGIN
  UPDATE conversations
    SET escrow_frozen = true
    WHERE id = p_conversation_id
      AND escrow_amount IS NOT NULL
      AND escrow_amount > 0;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No escrow to freeze');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$fn$ LANGUAGE plpgsql;


-- ============================================================
-- 6. increment_tx_count (backwards compat, now unused but safe)
-- ============================================================

CREATE OR REPLACE FUNCTION increment_tx_count(agent_uuid UUID)
RETURNS void AS $fn$
BEGIN
  UPDATE agents
    SET total_transactions = total_transactions + 1
    WHERE id = agent_uuid;
END;
$fn$ LANGUAGE plpgsql;


-- ============================================================
-- 7. set_config RPC for RLS scope (referenced by supabase.ts)
-- ============================================================

CREATE OR REPLACE FUNCTION set_config(setting TEXT, value TEXT)
RETURNS void AS $fn$
BEGIN
  PERFORM set_config(setting, value, true);  -- true = local to transaction
END;
$fn$ LANGUAGE plpgsql;


-- ============================================================
-- 8. Backfill key prefixes for existing agents
-- ============================================================
-- NOTE: This can't be done via SQL since we don't have the raw keys.
-- Existing agents will fall back to O(n) scan until they re-register.
-- New agents get prefixes automatically.
