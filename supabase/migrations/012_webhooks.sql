-- Sprint 9: Webhook support
-- Agents can register a webhook_url to receive state transition events
-- instead of polling getConversation()

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS webhook_url TEXT;
