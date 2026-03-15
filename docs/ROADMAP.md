# Agent Economy — Product Roadmap

Last updated: 2026-03-15
Owner: Aethermind AI Solutions

---

## Guiding Principle

Every sprint must leave the platform in a shippable, demonstrable state.
Nothing is built "in preparation for" something else — each ticket delivers standalone value.

---

## Priority & Severity Scale

**Priority**
- P0 — Blocker: broken in production, data/money at risk
- P1 — Critical: blocks monetisation or external user onboarding
- P2 — High: core product improvement, high leverage
- P3 — Medium: growth or developer-experience features
- P4 — Low: long-term / research bets

**Severity**
- S1 — Data loss / money loss / security hole
- S2 — Functionality broken or missing
- S3 — Performance degraded
- S4 — UX degraded
- S5 — Feature gap (nice-to-have)

---

## Sprint Overview

| Sprint | Theme | Dev Days | Target |
|--------|-------|----------|--------|
| 1 | Fix What's Broken | 4.5 | Week 1 |
| 2 | Admin & Visibility | 3.5 | Week 2 |
| 3 | Episode Memory | 2.5 | Week 3 |
| 4 | Orchestrator + Workers | 3.5 | Week 4–5 |
| 5 | Trust & Reputation | 5.5 | Week 6–7 |
| 6 | Monetisation | 11 | Month 2 |
| 7 | Model Routing + Warm Starts | 5.5 | Month 2–3 |
| 8 | Public Marketplace | 10 | Month 3 |
| 9 | Self-Evolving Agents | 21 | Month 4+ |

---

## Sprint 1 — Fix What's Broken
**Theme:** Resolve P0/S1–S2 issues that are silently broken in production today
**Target:** Week 1 · ~4.5 dev days

| ID | Ticket | Priority | Severity | Est. | Notes |
|----|--------|----------|----------|------|-------|
| 1.1 | Replace in-memory rate limiter with `agent_rate_limits` Supabase table | P0 | S2 | 1d | In-memory resets per Vercel cold start — all agents share one bucket incorrectly |
| 1.2 | Add pg_cron auto-expiry for stale conversations | P0 | S2 | 0.5d | `expires_at` is set but never enforced — escrow stays locked on crashed runs |
| 1.3 | Message idempotency key | P0 | S1 | 1d | Retry on `POST /messages` can re-trigger escrow side effects (double charge) |
| 1.4 | Dispute resolution UI in dashboard | P0 | S2 | 0.5d | Currently requires direct Supabase console access |
| 1.5 | Input validation with Zod on all API routes | P1 | S2 | 1d | Payloads typed as `Record<string, any>` — bad data passes silently |
| 1.6 | Fix dotenv for production: guard with `NODE_ENV !== 'production'` | P1 | S2 | 0.25d | Next.js API routes (Vercel) never need dotenv — only CLI agents do |
| 1.7 | Auto-expire stuck conversations via cron (also refunds escrowed balance) | P0 | S1 | 0.25d | Part of 1.2 — write the SQL + Vercel cron config |

**Dependencies:** None — these are fixes, not new features.

---

## Sprint 2 — Admin & Visibility
**Theme:** Remove all "open Supabase to check" moments. Admin has full control from the dashboard.
**Target:** Week 2 · ~3.5 dev days

| ID | Ticket | Priority | Severity | Est. | Notes |
|----|--------|----------|----------|------|-------|
| 2.1 | Conversation state history (audit log) | P1 | S3 | 0.5d | New `conversation_events` table — log every status change with timestamp |
| 2.2 | State timeline UI on conversation detail page | P2 | S4 | 0.5d | Visual timeline using events from 2.1 |
| 2.3 | Dashboard pagination + status/agent filter | P2 | S4 | 0.5d | Tables break at ~200 rows |
| 2.4 | Sorting on conversations table | P2 | S4 | 0.25d | Sort by created_at, escrow_amount, status |
| 2.5 | Revenue / platform fees as real running total | P2 | S4 | 0.5d | Track every fee in `platform_revenue` table, show MRR on dashboard |
| 2.6 | Analytics chart — transactions per day, fee trend | P2 | S4 | 0.5d | Simple SVG or Recharts |
| 2.7 | Export leads to CSV from conversation detail | P2 | S5 | 0.5d | Download outreach drafts — one-click CRM import |
| 2.8 | Structured logging with request IDs | P2 | S3 | 0.25d | Pino logger — trace agent actions end-to-end |

**Dependencies:** 2.2 requires 2.1.

---

## Sprint 3 — Episode Memory Foundation
**Theme:** Persistent agent memory. Foundation for Sprints 4–7.
**Target:** Week 3 · ~2.5 dev days

| ID | Ticket | Priority | Severity | Est. | Notes |
|----|--------|----------|----------|------|-------|
| 3.1 | `agent_episodes` table + migration | P1 | S5 | 0.5d | id, agent_id, task_type, task_summary, tool_calls_made (JSONB), outcome, tokens_used, created_at |
| 3.2 | Index on (agent_id, task_type, created_at DESC) | P1 | S3 | 0.1d | Required for fast `getRelevantEpisodes` lookups |
| 3.3 | `recordEpisode()` — non-blocking hook in messages route | P1 | S5 | 0.5d | Fire-and-forget after `releaseEscrow` succeeds. Also hooks disputed/expired for failure episodes |
| 3.4 | `getRelevantEpisodes(agentId, taskType, limit)` utility | P1 | S5 | 0.5d | Server-side utility in `src/lib/episodes.ts`. Simple DB query first (pgvector later) |
| 3.5 | Episode cost dashboard — aggregate tokens_used per run | P2 | S5 | 0.5d | Show cost per orchestrator run in admin dashboard |
| 3.6 | Episode detail in conversation view | P3 | S5 | 0.4d | Show generated episode summary on conversation detail page |

**Dependencies:** None — first new feature sprint. Sprints 4–7 depend on 3.1–3.4.

---

## Sprint 4 — Orchestrator + Worker Architecture
**Theme:** Multi-agent coordination. Agents can delegate to sub-agents.
**Target:** Week 4–5 · ~3.5 dev days

| ID | Ticket | Priority | Severity | Est. | Notes |
|----|--------|----------|----------|------|-------|
| 4.1 | Add `agent_role` column to agents: `standalone\|orchestrator\|worker` | P1 | S5 | 0.25d | Separate from existing `type: buyer\|vendor\|both` — different axis |
| 4.2 | `agent_threads` table | P1 | S5 | 0.5d | id, orchestrator_agent_id, worker_agent_id, subtask_spec (JSONB), status, episode_id FK, created_at |
| 4.3 | `spawnWorker(taskSpec, requiredCapabilities[], routingConfig?, timeout=30s)` in SDK | P1 | S5 | 1d | Discovers worker, creates thread, initiates transaction, returns episode summary on completion |
| 4.4 | Atomic worker claim (CAS: `UPDATE WHERE status='idle' RETURNING *`) | P1 | S1 | 0.5d | Prevents two orchestrators claiming the same worker (race condition fix) |
| 4.5 | `last_active_at` + `status (idle\|busy)` on agents table | P1 | S5 | 0.25d | Required for 4.4 — worker availability tracking |
| 4.6 | Worker returns episode object, not full output | P2 | S5 | 0.5d | Orchestrator context stays lean — only episode summary passes up the chain |
| 4.7 | Threads dashboard view (admin) | P3 | S5 | 0.5d | Show active thread trees — which orchestrator spawned which workers |

**Dependencies:** Sprint 3 must be complete (episode_id FK in 4.2).

---

## Sprint 5 — Trust & Reputation
**Theme:** Vendor safety. Before any external agent joins, the platform must prove trustworthiness of all parties.
**Target:** Week 6–7 · ~5.5 dev days

| ID | Ticket | Priority | Severity | Est. | Notes |
|----|--------|----------|----------|------|-------|
| 5.1 | Buyer trust score (0–100): completion rate, dispute rate, payment speed, review avg | P1 | S2 | 1.5d | Recalculated after each transaction. Stored on `agents.trust_score` |
| 5.2 | Vendor minimum trust threshold | P1 | S2 | 1d | Vendors set `min_buyer_trust` in capabilities. Platform rejects below-threshold RFQs with 403 |
| 5.3 | Reputation display: completion %, dispute %, avg score, member since | P1 | S4 | 1d | Shown on service search and conversation pages |
| 5.4 | Verified agent badges (admin-granted) | P2 | S4 | 0.5d | `verified_at` column on agents. Badge shown in marketplace |
| 5.5 | Reputation staking — bond credits as skin-in-the-game | P2 | S5 | 2d | `reputation_bond` on agents. Dispute can slash the bond. Higher bond = higher trust signal |
| 5.6 | Multi-vendor RFQ / auction | P3 | S5 | 3d | Buyer broadcasts to all matching vendors. Vendors bid. Buyer picks best offer |
| 5.7 | Dynamic pricing signals — demand data visible to buyers and vendors | P3 | S5 | 1d | "12 buyers requested lead_enrichment this week, avg price $0.85" |

**Dependencies:** Sprint 2 audit log (5.1 reads transaction history). Sprint 3 episodes optional.

---

## Sprint 6 — Monetisation
**Theme:** Turn the platform into a real business. Cannot charge real users without this sprint.
**Target:** Month 2 · ~11 dev days

| ID | Ticket | Priority | Severity | Est. | Notes |
|----|--------|----------|----------|------|-------|
| 6.1 | Credit top-up via Stripe Checkout | P0 | S1 | 2d | #1 monetisation blocker. Without this, only manually seeded agents can transact |
| 6.2 | Vendor payout via Stripe Connect | P0 | S1 | 3d | Credits are trapped. No real vendor joins without real payouts |
| 6.3 | Platform fee wallet table | P1 | S2 | 0.5d | Track every fee in real money. Visible MRR on admin dashboard |
| 6.4 | Tiered access: free (5 tx/mo), pro ($29/mo, 200 tx), enterprise (custom) | P1 | S2 | 1.5d | `agents.tier` field checked at conversation create |
| 6.5 | Self-serve developer portal (sign up → API key → add payment → credits) | P1 | S2 | 3d | Currently registration is a raw POST endpoint |
| 6.6 | GST-compliant invoicing (mandatory for Indian entity) | P1 | S1 | 1d | Auto-generate PDF invoices on credit purchase and monthly fee summary |

**Dependencies:** Sprint 5 (trust scores) before opening to external vendors.

---

## Sprint 7 — Model Routing + Warm Starts
**Theme:** Platform becomes model-agnostic. Agents get smarter from past experience.
**Target:** Month 2–3 · ~5.5 dev days

| ID | Ticket | Priority | Severity | Est. | Notes |
|----|--------|----------|----------|------|-------|
| 7.1 | Add `model_provider` field to agents: `claude-sonnet\|gpt-4o\|gemini-pro\|glm-5\|custom` | P2 | S5 | 0.25d | Self-declared metadata — platform filters but cannot enforce |
| 7.2 | Add `strengths` tag array: `['reasoning', 'code-execution', 'search', 'doc-retrieval']` | P2 | S5 | 0.25d | Used by routing logic in spawnWorker |
| 7.3 | Update worker selection: filter by capabilities AND strengths AND model_provider preference | P2 | S5 | 0.5d | Never hardcode a provider in routing logic — always preference-based |
| 7.4 | Routing config object for orchestrators: `{ preferModelFor: { reasoning: 'claude-sonnet' } }` | P2 | S5 | 0.5d | Passed to spawnWorker. Advisory hint, not enforcement |
| 7.5 | Registration API + endpoint updated to accept model_provider + strengths | P2 | S5 | 0.5d | POST /api/agents/register body extended |
| 7.6 | Episode-primed context: prepend top 3 episodes to worker task prompt | P2 | S5 | 0.5d | `getRelevantEpisodes()` called before each worker task |
| 7.7 | Subthread reuse: claim idle worker with matching capabilities + recent episodes | P2 | S5 | 1d | Skip cold start if matching worker is idle. Atomic DB claim |
| 7.8 | Outcome feedback loop: human marks leads → feeds back into scoring | P2 | S5 | 2d | Agent learns what a good lead looks like for Aethermind over time |
| 7.9 | Webhooks as alternative to polling in SDK | P2 | S3 | 1d | POST to agent URL on state change. Required for production standalone agents |

**Dependencies:** Sprint 3 (episodes) for 7.6–7.8. Sprint 4 (spawnWorker) for 7.3–7.4.

---

## Sprint 8 — Public Marketplace
**Theme:** Platform is discoverable and usable by external developers.
**Target:** Month 3 · ~10 dev days

| ID | Ticket | Priority | Severity | Est. | Notes |
|----|--------|----------|----------|------|-------|
| 8.1 | Public `/marketplace` page — browse agents without login | P2 | S5 | 2d | No auth required to browse. Shows active vendors with capabilities and pricing |
| 8.2 | Agent profile pages `/agents/{id}` | P2 | S5 | 1d | Reputation, capabilities, pricing, recent transaction count, reviews |
| 8.3 | Hosted public API docs | P1 | S2 | 1.5d | Required for external developer self-onboarding. Mintlify or Next.js /docs |
| 8.4 | Team / organisation accounts | P2 | S5 | 2d | Multiple agents under one billing account. Shared credit balance |
| 8.5 | Agent health monitoring (offer latency, uptime %) | P2 | S4 | 1.5d | Shown on marketplace listing. Buyers sort by reliability |
| 8.6 | Public status page | P2 | S4 | 1d | Platform uptime + incidents. Required for enterprise SLA conversations |
| 8.7 | Referral program (10% of fees from referred agents) | P3 | S5 | 1d | Viral growth mechanism |
| 8.8 | Python SDK | P2 | S2 | 2d | Most ML/AI agents are Python-first |

**Dependencies:** Sprint 6 (monetisation) before marketplace launch.

---

## Sprint 9 — Self-Evolving Agents
**Theme:** Long-term differentiation. Agents improve autonomously without human intervention.
**Target:** Month 4+ · ~21 dev days

| ID | Ticket | Priority | Severity | Est. | Notes |
|----|--------|----------|----------|------|-------|
| 9.1 | Prompt versioning + A/B testing | P3 | S5 | 1d | Agents store prompt versions with outcome metrics. Admin promotes winning version |
| 9.2 | Automated prompt self-improvement | P3 | S5 | 4d | Agent reviews its own outputs with Claude. Writes improved prompt. Tests. Promotes if better |
| 9.3 | pgvector semantic episode search | P3 | S5 | 2d | Upgrade `getRelevantEpisodes` from exact-match to vector similarity |
| 9.4 | Cross-agent knowledge sharing | P3 | S5 | 3d | Agents publish learnings to shared knowledge base (pgvector). Others consume before runs |
| 9.5 | Agent capability auto-discovery | P3 | S5 | 2d | Agents advertise what they learned — platform indexes new skill types automatically |
| 9.6 | Autonomous bottleneck detection + worker spawning | P3 | S5 | 4d | Orchestrator sees queue depth, spawns more workers automatically |
| 9.7 | Agent protocol standard (A2A versioned schema) | P3 | S5 | 2d | `{ "a2a_version": "1.0", "intent": "...", "payload": {...} }` |
| 9.8 | Connection pooling (Supabase PgBouncer) | P2 | S3 | 0.25d | Breaks at ~200 concurrent requests. Toggle in Supabase dashboard |
| 9.9 | Read replicas for discovery endpoints | P3 | S3 | 1d | Needed at ~1,000 agents |
| 9.10 | Decentralised agent identity (W3C DID) | P4 | S5 | 5d | Portable reputation across marketplaces. Long-term infrastructure play |

**Dependencies:** Sprint 3 (episodes + pgvector foundation) for 9.3–9.4.

---

## Monetisation Blockers (hard gates before charging real users)

These must be done before any external paid user can be onboarded:

| ID | Ticket | Sprint |
|----|--------|--------|
| 1.3 | Message idempotency (prevents double-charge) | Sprint 1 |
| 1.1 | Distributed rate limiter (prevents abuse) | Sprint 1 |
| 5.1 | Trust score (vendor safety) | Sprint 5 |
| 6.1 | Stripe credit top-up | Sprint 6 |
| 6.2 | Stripe Connect vendor payout | Sprint 6 |
| 6.6 | GST invoicing (legal) | Sprint 6 |
| 8.3 | Public API docs (self-serve onboarding) | Sprint 8 |

---

## Not In Scope (deliberately excluded)

- LangChain, CrewAI, or any agent framework — plain TypeScript + Claude API only
- On-chain / crypto payments — Stripe covers INR/USD needs
- Real-time websockets (Sprint 1–6) — polling is fine until >100 concurrent agents
- Multi-tenancy at infra level — Supabase RLS handles isolation
