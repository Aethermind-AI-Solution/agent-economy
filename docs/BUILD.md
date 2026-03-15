# Build Tracker — Agent Economy Platform

Last updated: 2026-03-15
Active sprint: Sprint 1 — Fix What's Broken

---

## Current Sprint: Sprint 1

**Goal:** Resolve all P0/S1–S2 issues that are silently broken in production.
**Target:** Week 1 of 2026-03-15

| ID | Ticket | Status | Owner | Notes |
|----|--------|--------|-------|-------|
| 1.1 | Replace in-memory rate limiter with Supabase `agent_rate_limits` table | 🔲 Pending | — | Resets per Vercel cold start |
| 1.2 | pg_cron auto-expiry for stale conversations | 🔲 Pending | — | `expires_at` never enforced today |
| 1.3 | Message idempotency key | 🔲 Pending | — | S1 — retry can double-charge escrow |
| 1.4 | Dispute resolution UI in dashboard | 🔲 Pending | — | Currently needs Supabase console |
| 1.5 | Input validation (Zod) on all API routes | 🔲 Pending | — | Bad data passes silently |
| 1.6 | Guard dotenv with `NODE_ENV !== 'production'` | 🔲 Pending | — | API routes on Vercel don't need dotenv |

---

## Completed Sprints

### Pre-Sprint — Platform MVP (2026-03-13)

| Feature | Shipped |
|---------|---------|
| Agent marketplace protocol (rfq → offer → accept → deliver → confirm) | ✅ |
| Escrow system (atomic Postgres RPCs, 5% platform fee) | ✅ |
| Agent registration + bcrypt API key auth | ✅ |
| Admin dashboard | ✅ |
| Conversation detail page (smart payload rendering) | ✅ |
| Lead Gen Crew — ResearchAgent → DataAgent → SalesAgent | ✅ |
| Dashboard: disputes stat, query column, refresh button, clickable links | ✅ |
| Crew: timeout (150s), platform check, input validation (≥10 chars), quiet dotenv | ✅ |

---

## Sprint Queue

| Sprint | Theme | Status |
|--------|-------|--------|
| Sprint 1 | Fix What's Broken | 🟡 Active |
| Sprint 2 | Admin & Visibility | 🔲 Queued |
| Sprint 3 | Episode Memory | 🔲 Queued |
| Sprint 4 | Orchestrator + Workers | 🔲 Queued |
| Sprint 5 | Trust & Reputation | 🔲 Queued |
| Sprint 6 | Monetisation | 🔲 Queued |
| Sprint 7 | Model Routing + Warm Starts | 🔲 Queued |
| Sprint 8 | Public Marketplace | 🔲 Queued |
| Sprint 9 | Self-Evolving Agents | 🔲 Queued |

---

## Key Files by Sprint

### Sprint 1
- `src/app/api/conversations/[id]/messages/route.ts` — idempotency key check
- `src/lib/rate-limit.ts` — replace in-memory with Supabase table
- `supabase/migrations/003_rate_limits.sql` — new table + pg_cron job
- `src/app/page.tsx` — dispute resolution buttons
- `src/app/api/` — Zod validation on all routes

### Sprint 2
- `supabase/migrations/004_conversation_events.sql` — audit log table
- `src/app/conversations/[id]/page.tsx` — state timeline UI
- `src/app/page.tsx` — pagination, filters, analytics chart

### Sprint 3
- `supabase/migrations/005_agent_episodes.sql` — episodes table + index
- `src/lib/episodes.ts` — recordEpisode(), getRelevantEpisodes()
- `src/app/api/conversations/[id]/messages/route.ts` — hook after releaseEscrow

### Sprint 4
- `supabase/migrations/006_orchestrator_threads.sql` — agent_threads + agent_role
- `src/lib/sdk.ts` — spawnWorker() method

### Sprint 5
- `supabase/migrations/007_trust_reputation.sql` — trust_score, min_buyer_trust, reputation_bond
- `src/lib/trust.ts` — computeTrustScore(), enforceMinTrust()
- `src/app/api/conversations/route.ts` — trust gate on createConversation

### Sprint 6
- `src/app/api/billing/` — Stripe checkout, webhooks, Connect payouts
- `src/app/api/agents/register/route.ts` — tier enforcement
- `src/app/portal/` — self-serve developer portal pages

### Sprint 7
- `src/lib/sdk.ts` — routing config types, episode priming in spawnWorker
- `supabase/migrations/008_model_routing.sql` — model_provider, strengths, last_active_at
- `src/app/api/services/search/route.ts` — strengths + model_provider filter

---

## Environment Variables

| Variable | Used by | Status |
|----------|---------|--------|
| `SUPABASE_URL` | Platform API | ✅ Set |
| `SUPABASE_SERVICE_KEY` | Platform API | ✅ Set |
| `ADMIN_PASSWORD` | Dashboard | ✅ Set |
| `PLATFORM_URL` | All agents (CLI) | ✅ Set (localhost:3001 dev) |
| `ANTHROPIC_API_KEY` | Lead gen crew | ✅ Set |
| `RESEARCH_AGENT_KEY` | run-crew.ts | ✅ Auto-saved |
| `DATA_AGENT_KEY` | run-crew.ts | ✅ Auto-saved |
| `SALES_AGENT_KEY` | run-crew.ts | ✅ Auto-saved |
| `STRIPE_SECRET_KEY` | Sprint 6 billing | 🔲 Not yet |
| `STRIPE_WEBHOOK_SECRET` | Sprint 6 billing | 🔲 Not yet |
| `STRIPE_CONNECT_CLIENT_ID` | Sprint 6 payouts | 🔲 Not yet |

---

## Known Production Issues (as of 2026-03-15)

| Issue | Severity | Sprint |
|-------|----------|--------|
| In-memory rate limiter resets per Vercel cold start | S2 | Sprint 1 |
| `expires_at` on conversations is set but never enforced | S2 | Sprint 1 |
| Message retry can re-trigger escrow side effects | S1 | Sprint 1 |
| Disputed conversations require Supabase console to resolve | S2 | Sprint 1 |
| dotenv called in API route context unnecessarily | S2 | Sprint 1 |
| No audit trail of financial operations | S3 | Sprint 2 |

---

## How to Start a Sprint

1. Pick the next sprint from the queue above
2. Create a Supabase migration file: `supabase/migrations/00N_description.sql`
3. Run it in Supabase dashboard (SQL editor) and on local dev
4. Implement code changes
5. Update this file: mark tickets ✅ Done, update sprint status
6. Update `LESSONS.md` with anything learned
7. Update `ROADMAP.md` if scope or estimates changed
8. Commit: `git commit -m "feat(sprintN): description"`
9. Push to main (auto-deploys to Vercel)
