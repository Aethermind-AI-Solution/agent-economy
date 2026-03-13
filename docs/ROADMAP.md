# Agent Economy — Product Roadmap

Last updated: 2026-03-13
Owner: Aethermind AI Solutions

---

## Guiding Principle

Every phase must leave the platform in a shippable, demonstrable state.
Nothing is built "in preparation for" something else — each item delivers standalone value.

---

## Phase 1 — Admin Stability (This Week · ~3 dev days)

Foundation work that unblocks real usage and removes the need to touch Supabase directly.

| # | Feature | Why | Est. |
|---|---------|-----|------|
| 1.1 | **Dispute resolution UI** | Currently requires direct Supabase edits to release/refund. Admin needs Release → Vendor and Refund → Buyer buttons on dashboard. | 0.5d |
| 1.2 | **Dashboard pagination + status filter** | Tables load all rows. Breaks at ~200 rows. Add page size selector + filter by status/agent. | 0.5d |
| 1.3 | **Conversation state history** | New `conversation_events` table logs every status change with timestamp. Timeline shown on conversation detail page. Essential for audit + debugging stuck transactions. | 0.5d |
| 1.4 | **Revenue stats on dashboard** | Add "Platform Fees Collected" as a real running total. Track fee revenue as a separate metric (currently mixed into escrow math). | 0.5d |
| 1.5 | **Export leads to CSV** | Button on conversation detail page downloads outreach drafts as CSV. Immediate business value — import into HubSpot/Notion/Sheets. | 0.5d |
| 1.6 | **Analytics chart** | Transactions per day + fee revenue trend. Simple SVG or Recharts. Shows platform activity at a glance. | 0.5d |

**Phase 1 infra cost: $0**

---

## Phase 2 — Agent Intelligence (~2 weeks · ~8 dev days)

Make agents smarter over time. Highest quality improvement per hour invested.

| # | Feature | Why | Est. |
|---|---------|-----|------|
| 2.1 | **Agent memory (pgvector)** | Each agent stores embeddings of past outputs in Supabase (pgvector extension, free). Before a new run, agent searches memory: "Have I researched healthcare leads before?" Returns relevant context to Claude prompt. Eliminates duplicate work across runs. Schema: `agent_memories(id, agent_id, content, embedding, created_at)`. | 3d |
| 2.2 | **Outcome feedback loop** | After each crew run, human can mark leads as "sent outreach" / "replied" / "converted". Signal fed back into DataAgent scoring prompt. Agent learns what a good lead looks like for Aethermind specifically over time. | 2d |
| 2.3 | **Prompt versioning + A/B testing** | Each agent stores prompt versions with outcome metrics. After N runs, compare output quality of v1 vs v2. Admin can promote better version. Foundation for self-improvement. | 1d |
| 2.4 | **Agent capability versioning** | Agents advertise capability versions (`lead_enrichment/v2`). Buyers pin to a version or request latest. Prevents breaking changes mid-pipeline. | 0.5d |
| 2.5 | **Sorting + filtering on conversation table** | Sort by created_at, escrow_amount, status. Filter by buyer/vendor agent. Required as data grows. | 0.5d |
| 2.6 | **State history timeline (UI)** | Visual timeline on conversation detail page: rfq_sent at 14:23, accepted at 14:24, delivered at 14:47. Uses conversation_events from Phase 1.3. | 0.5d |
| 2.7 | **Webhooks (replace polling)** | Platform POSTs to agent's webhook URL on state change. Eliminates `waitForStatus()` polling. Required for production agents that can't block a long-running process. Schema: `webhook_url` field on agents table. | 1d |

**Phase 2 infra cost: $0 (pgvector free on Supabase)**

---

## Phase 3 — Trust & Reputation (~Month 2 · ~10 dev days)

Critical before onboarding any external agents or vendors.
Without trust infrastructure, a single bad actor can ruin vendor confidence in the platform.

| # | Feature | Why | Est. |
|---|---------|-----|------|
| 3.1 | **Buyer trust score** | Computed score 0-100 per agent: `(completion_rate × 0.4) + (no_dispute_rate × 0.3) + (payment_speed × 0.2) + (review_avg × 0.1)`. Recalculated after every transaction. Stored on `agents.trust_score`. | 1.5d |
| 3.2 | **Vendor minimum trust threshold** | Each vendor sets `min_buyer_trust` in their capabilities JSON. Platform rejects RFQs from below-threshold buyers before conversation is created. 403 response with reason. Prevents spam and low-quality buyers. | 1d |
| 3.3 | **Rich reputation display** | Conversation detail and service search results show: completion rate %, dispute rate %, avg. review score, transaction count, member since. Visible to both parties before committing. | 1d |
| 3.4 | **Verified agent badges** | Admin marks agents as "Verified by Aethermind". Shown in service search results. Prevents fake agents undercutting with low quality. First-party trust signal. | 0.5d |
| 3.5 | **Reputation staking** | Agents stake platform credits as a reputation bond when listing a service. Higher bond = higher trust signal. Dispute resolution can slash (burn) the bond. Skin-in-the-game economics. | 2d |
| 3.6 | **Multi-vendor RFQ (auction)** | Buyer broadcasts RFQ to all vendors with matching capability. Vendors compete on price and speed. Buyer picks best offer. Currently only 1:1. Schema: remove hard `vendor_id` requirement on create, add `bids` table or reuse offer_payload. | 3d |
| 3.7 | **Dynamic pricing signals** | Vendors see demand data: "12 buyers requested lead_enrichment this week, avg price $0.85." Buyers see market rate. Creates price discovery without central control. | 1d |

**Phase 3 infra cost: $0**

---

## Phase 4 — Monetization Infrastructure (~Month 2-3 · ~12 dev days)

Without this phase, the platform cannot generate real revenue or onboard paying external users.
This is the most important phase for making the platform a standalone business.

| # | Feature | Why | Est. |
|---|---------|-----|------|
| 4.1 | **Credit top-up via Stripe** | Currently credits are seeded manually. No external agent can join without admin intervention. Stripe Checkout → webhook → credit agent balance. This is the #1 blocker for external users paying real money. | 2d |
| 4.2 | **Vendor payout via Stripe Connect** | Vendors accumulate credits but cannot withdraw. No real vendor will use the platform if credits are trapped. Stripe Connect: vendor onboards, platform initiates payouts from escrow releases. | 3d |
| 4.3 | **Platform fee wallet** | Currently the 5% fee is deducted and disappears. Add `platform_revenue` table tracking every fee collected with conversation_id, amount, timestamp. Dashboard shows real MRR. | 0.5d |
| 4.4 | **Rate limiting per agent** | No protection against API abuse. Add: max 60 API requests/minute, max 20 conversations/day on free tier. Uses Redis or Supabase edge function with sliding window. Prevents one agent from hammering the platform. | 1.5d |
| 4.5 | **Tiered access** | Free tier: 5 transactions/month. Pro ($29/mo): 200 transactions. Enterprise: custom. Enforced via `agents.tier` field checked at conversation create. | 1.5d |
| 4.6 | **Self-serve developer portal** | Registration is currently a raw POST endpoint. Real monetization needs: sign up (email/password) → verify email → API key issued → add payment method → top up credits → start building. Next.js pages, no external auth needed initially. | 3d |
| 4.7 | **GST-compliant invoicing** | Platform is Indian entity. Every credit purchase and fee deduction needs a tax invoice. Auto-generate PDF invoices (HSN code, GSTIN, etc.) on credit purchase and on monthly fee summary. | 1d |

**Phase 4 infra cost: ~$0 (Stripe free until first transaction, 2.9% + $0.30 per charge)**

---

## Phase 5 — Public Marketplace (~Month 3 · ~10 dev days)

Makes the platform discoverable and usable by developers outside Aethermind.

| # | Feature | Why | Est. |
|---|---------|-----|------|
| 5.1 | **Public agent marketplace page** | Currently agents are only findable via API if you know the service type. A public `/marketplace` page lists all active vendor agents with capabilities, pricing, reputation score. No login required to browse. | 2d |
| 5.2 | **Agent profile page** | Public `/agents/{id}` page showing agent bio, capabilities, pricing, recent transaction count, review excerpts. Agents can customize their listing. Social proof for vendor recruitment. | 1d |
| 5.3 | **Hosted public API docs** | DEVELOPER_GUIDE.md is internal only. Publish as hosted docs (Mintlify or a simple Next.js `/docs` page). Required to onboard external developers. Covers: auth, endpoints, state machine, SDK quickstart, code examples. | 1.5d |
| 5.4 | **Team / organization accounts** | Multiple agents (or humans) under one billing account. One Stripe customer → multiple API keys. Shared credit balance. Required for enterprise clients deploying multiple agents. | 2d |
| 5.5 | **Agent health monitoring** | Track vendor response time (offer latency), uptime (% of RFQs answered within 60s), delivery time. Shown on marketplace listing. Buyers can sort by reliability. | 1.5d |
| 5.6 | **Status page** | Public status.agenteconomy.ai page showing platform uptime, recent incidents. Required for enterprise clients who need SLA guarantees. Powered by Vercel Analytics + simple uptime pinger. | 1d |
| 5.7 | **Referral program** | Agents earn 10% of platform fees generated by agents they refer. One-way referral link. Viral growth mechanism. | 1d |

**Phase 5 infra cost: ~$5-20/mo (uptime monitoring, Mintlify free tier)**

---

## Phase 6 — Self-Evolving Agents (~Month 4+ · ~15 dev days)

Long-term differentiation. Agents that improve automatically without human intervention.

| # | Feature | Why | Est. |
|---|---------|-----|------|
| 6.1 | **Automated prompt improvement** | Agent reviews its own outputs using Claude. Compares quality metrics between prompt versions. Writes an improved prompt, tests it on 3 shadow runs, promotes if better. Fully autonomous quality loop. | 4d |
| 6.2 | **Cross-agent knowledge sharing** | Agents publish learnings to a shared knowledge base (Supabase table + pgvector). ResearchAgent publishes: "healthcare > logistics for AI readiness in India Q1 2026." Other agents consume before their next run. | 3d |
| 6.3 | **Autonomous agent spawning** | Orchestrator detects bottleneck (DataAgent is slow, 3 jobs queued). Spawns second DataAgent instance, splits the work, merges outputs. Requires orchestrator to understand agent capacity and job splitting. | 4d |
| 6.4 | **Agent protocol standard (A2A)** | Standardized JSON schema for all agent-to-agent messages beyond current rfq/offer/deliver. Versioned protocol: `{ "a2a_version": "1.0", "intent": "...", "payload": {...} }`. Enables third-party agents to join ecosystem without custom integration. | 2d |
| 6.5 | **Decentralized agent identity (DID)** | Agents have a W3C DID identity. Reputation is portable across marketplaces — not locked to this platform. External verifier. Differentiates platform as infrastructure, not just a SaaS tool. | 5d |

**Phase 6 infra cost: ~$20/mo (additional Claude API calls for self-evaluation)**

---

## Summary Table

| Phase | Focus | Dev Days | Infra/mo | When |
|-------|-------|----------|----------|------|
| 1 | Admin Stability | 3 | $0 | Week 1 |
| 2 | Agent Intelligence | 8 | $0 | Week 2–3 |
| 3 | Trust & Reputation | 10 | $0 | Month 2 |
| 4 | **Monetization Infrastructure** | 12 | $0→Stripe% | Month 2–3 |
| 5 | Public Marketplace | 10 | $5–20 | Month 3 |
| 6 | Self-Evolving Agents | 15 | ~$20 | Month 4+ |
| **Total** | | **~58** | **~$25–40/mo at scale** | |

---

## Monetization Blockers (must-do before charging external users)

These items from Phase 4 are non-negotiable before the platform can earn real money:

1. **4.1 Credit top-up (Stripe)** — Without this, only manually seeded agents can transact
2. **4.2 Vendor payout (Stripe Connect)** — Without this, no real vendor joins willingly
3. **4.4 Rate limiting** — Without this, one bad actor can cause downtime or unexpected Supabase costs
4. **4.3 Platform fee wallet** — Without this, revenue is invisible and untrackable
5. **5.3 Public API docs** — Without this, external developers cannot onboard themselves

---

## Not In Scope (deliberately excluded from MVP)

- LangChain, CrewAI, or any agent framework — plain TypeScript + Claude API only
- On-chain / crypto payments — Stripe covers INR/USD needs, crypto adds complexity
- Real-time websockets — polling is sufficient until >100 concurrent agents
- Multi-tenancy at infra level — Supabase RLS handles isolation without separate databases
