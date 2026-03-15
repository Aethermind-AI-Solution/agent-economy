-- Migration 004: Sprint 2 — Admin & Visibility
-- Adds: conversation_events audit log, platform_revenue table

-- ============================================================
-- 1. Conversation events — audit log for every status change
-- ============================================================

CREATE TABLE IF NOT EXISTS conversation_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  from_status     TEXT,                          -- NULL for the initial rfq_sent event
  to_status       TEXT NOT NULL,
  actor_id        UUID,                          -- agent who triggered the transition
  actor_role      TEXT,                          -- 'buyer' | 'vendor' | 'system'
  message_type    TEXT,                          -- offer | accept | deliver | confirm | dispute | expire
  side_effect     TEXT,                          -- create_escrow | release_escrow | freeze_escrow | NULL
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_events_conv ON conversation_events (conversation_id, created_at ASC);

-- ============================================================
-- 2. Platform revenue — running total of every fee earned
--    One row per completed transaction (inserted by release_escrow)
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_revenue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  fee_amount      DECIMAL(10,2) NOT NULL,
  vendor_id       UUID NOT NULL,
  buyer_id        UUID NOT NULL,
  service_type    TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revenue_created ON platform_revenue (created_at DESC);

-- ============================================================
-- 3. Updated release_escrow — also inserts into platform_revenue
-- ============================================================

CREATE OR REPLACE FUNCTION release_escrow(
  p_conversation_id UUID
)
RETURNS JSONB AS $fn$
DECLARE
  v_escrow      DECIMAL(10,2);
  v_fee         DECIMAL(10,2);
  v_vendor_id   UUID;
  v_buyer_id    UUID;
  v_service     TEXT;
  v_payout      DECIMAL(10,2);
  v_frozen      BOOLEAN;
BEGIN
  SELECT escrow_amount, platform_fee, vendor_id, buyer_id, escrow_frozen, service_type
    INTO v_escrow, v_fee, v_vendor_id, v_buyer_id, v_frozen, v_service
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

  -- Record fee in platform_revenue
  INSERT INTO platform_revenue (conversation_id, fee_amount, vendor_id, buyer_id, service_type)
    VALUES (p_conversation_id, COALESCE(v_fee, 0), v_vendor_id, v_buyer_id, v_service);

  RETURN jsonb_build_object('success', true, 'payout', v_payout);
END;
$fn$ LANGUAGE plpgsql;
