-- Agent Economy Platform: Initial Schema
-- Run this on Day 1. Everything else builds on top of this.

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE agent_type AS ENUM ('buyer', 'vendor', 'both');
CREATE TYPE agent_status AS ENUM ('active', 'suspended');
CREATE TYPE conversation_status AS ENUM (
  'rfq_sent',
  'offer_sent',
  'accepted',
  'delivered',
  'completed',
  'rejected',
  'disputed',
  'expired'
);

-- ============================================================
-- TABLE 1: agents
-- ============================================================

CREATE TABLE agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  type          agent_type NOT NULL DEFAULT 'both',
  api_key_hash  TEXT NOT NULL UNIQUE,
  balance       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  capabilities  JSONB DEFAULT '[]'::jsonb,
  -- Example capabilities:
  -- [{ "service_type": "image_generation",
  --    "pricing": { "model": "per_unit", "unit_price": 1.50, "currency": "USD" },
  --    "description": "DALL-E 3 photorealistic product images" }]
  reputation_score    DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  total_transactions  INTEGER NOT NULL DEFAULT 0,
  status              agent_status NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT balance_non_negative CHECK (balance >= 0),
  CONSTRAINT reputation_range CHECK (reputation_score >= 0 AND reputation_score <= 5)
);

-- ============================================================
-- TABLE 2: conversations
-- ============================================================

CREATE TABLE conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id          UUID NOT NULL REFERENCES agents(id),
  vendor_id         UUID NOT NULL REFERENCES agents(id),
  service_type      TEXT NOT NULL,
  status            conversation_status NOT NULL DEFAULT 'rfq_sent',

  -- Protocol payloads (JSONB = no migrations when schema evolves)
  rfq_payload       JSONB NOT NULL,
  offer_payload     JSONB,
  delivery_payload  JSONB,

  -- Financial
  escrow_amount     DECIMAL(10,2),
  platform_fee      DECIMAL(10,2),

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),

  CONSTRAINT different_parties CHECK (buyer_id != vendor_id),
  CONSTRAINT escrow_non_negative CHECK (escrow_amount IS NULL OR escrow_amount >= 0)
);

-- ============================================================
-- TABLE 3: reviews
-- ============================================================

CREATE TABLE reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id),
  reviewer_id       UUID NOT NULL REFERENCES agents(id),
  reviewee_id       UUID NOT NULL REFERENCES agents(id),
  rating            INTEGER NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rating_range CHECK (rating >= 1 AND rating <= 5),
  CONSTRAINT one_review_per_party UNIQUE (conversation_id, reviewer_id),
  CONSTRAINT no_self_review CHECK (reviewer_id != reviewee_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Service discovery: find vendors by capability
CREATE INDEX idx_agents_capabilities ON agents USING gin(capabilities);
CREATE INDEX idx_agents_status ON agents(status) WHERE status = 'active';

-- Conversation queries: both agents need to find their conversations
CREATE INDEX idx_conversations_buyer ON conversations(buyer_id, status);
CREATE INDEX idx_conversations_vendor ON conversations(vendor_id, status);
CREATE INDEX idx_conversations_expires ON conversations(expires_at)
  WHERE status IN ('rfq_sent', 'offer_sent', 'delivered');

-- Reviews: compute reputation
CREATE INDEX idx_reviews_reviewee ON reviews(reviewee_id);

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Note: RLS policies reference the agent_id from the API auth
-- layer. Supabase uses auth.uid(), but since we use custom API
-- keys, we set the agent_id via a session variable:
--   SET LOCAL app.current_agent_id = '<agent_uuid>';

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Agents can read their own profile
CREATE POLICY agents_self_read ON agents
  FOR SELECT USING (id::text = current_setting('app.current_agent_id', true));

-- Conversations visible to participants only
CREATE POLICY conversations_participant ON conversations
  FOR SELECT USING (
    buyer_id::text = current_setting('app.current_agent_id', true)
    OR vendor_id::text = current_setting('app.current_agent_id', true)
  );

-- Reviews visible to participants
CREATE POLICY reviews_participant ON reviews
  FOR SELECT USING (
    reviewer_id::text = current_setting('app.current_agent_id', true)
    OR reviewee_id::text = current_setting('app.current_agent_id', true)
  );

-- ============================================================
-- SEED DATA (for Hello World demo)
-- ============================================================
-- Run after migration to pre-load demo agents.
-- API keys shown here are for development only.
-- In production, agents register via API and receive hashed keys.

-- ProcureBot: buyer with $50 starting balance
-- Raw API key: pk_buyer_procurebot_demo_key_001
-- INSERT INTO agents (name, type, api_key_hash, balance)
-- VALUES ('ProcureBot', 'buyer',
--   '$2b$10$REPLACE_WITH_BCRYPT_HASH', 50.00);

-- PixelForge: vendor with image generation capability
-- Raw API key: pk_vendor_pixelforge_demo_key_001
-- INSERT INTO agents (name, type, api_key_hash, balance, capabilities)
-- VALUES ('PixelForge', 'vendor',
--   '$2b$10$REPLACE_WITH_BCRYPT_HASH', 0.00,
--   '[{"service_type": "image_generation",
--     "pricing": {"model": "per_unit", "unit_price": 1.50, "currency": "USD"},
--     "description": "DALL-E 3 photorealistic product images, 1024x1024"}]');
