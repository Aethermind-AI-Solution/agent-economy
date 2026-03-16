# Build Tracker — Agent Economy Platform

Last updated: 2026-03-16
Active sprint: Sprint 4 — Orchestrator + Workers

---

## Completed Sprints

### Sprint 3 — Episode Memory (2026-03-16)

| ID | Ticket | Status |
|----|--------|--------|
| 3.1 | `agent_episodes` table + RLS + index | ✅ Done |
| 3.2 | `src/lib/episodes.ts` — `recordEpisode()` + `getRelevantEpisodes()` | ✅ Done |
| 3.3 | Hook in messages route — fires on `completed` + `disputed` (fire-and-forget) | ✅ Done |
| 3.4 | `GET /api/agents/me/episodes` API route | ✅ Done |
| 3.5 | `getMyEpisodes()` in SDK + `Episode` interface | ✅ Done |
| 3.6 | Crew integration — `sdk?` param + episode context injected into Claude system prompts | ✅ Done |
| 3.7 | Dashboard — Episodes column on agents table (purple if >0) | ✅ Done |

### Sprint 2 — Admin & Visibility (2026-03-15)

| ID | Ticket | Status |
|----|--------|--------|
| 2.1 | `conversation_events` audit log table | ✅ Done |
| 2.2 | State timeline UI on conversation detail page | ✅ Done |
| 2.3 | Dashboard pagination (25/page) | ✅ Done |
| 2.4 | Sortable columns (Escrow ↑↓, Created ↑↓) | ✅ Done |
| 2.5 | `platform_revenue` table + MRR stat | ✅ Done |
| 2.6 | SVG analytics chart (transactions/day + fee trend) | ✅ Done |
| 2.7 | CSV export button on conversation detail page | ✅ Done |
| 2.8 | Structured JSON logging in messages + cron routes | ✅ Done |

### Sprint 1 — Fix What's Broken (2026-03-15)

| ID | Ticket | Status |
|----|--------|--------|
| 1.1 | Replace in-memory rate limiter with Supabase `agent_rate_limits` | ✅ Done |
| 1.2 | Auto-expiry cron endpoint (`/api/cron/expire-conversations`) | ✅ Done |
| 1.3 | Message idempotency key (`Idempotency-Key` header + cache table) | ✅ Done |
| 1.4 | Dispute resolution UI + admin API | ✅ Done |
| 1.5 | Zod input validation on all API routes | ✅ Done |
| 1.6 | dotenv scope clarification (comment in supabase.ts) | ✅ Done |

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
| Sprint 1 | Fix What's Broken | ✅ Done |
| Sprint 2 | Admin & Visibility | ✅ Done |
| Sprint 3 | Episode Memory | ✅ Done |
| Sprint 4 | Orchestrator + Workers | 🟡 Next |
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
- `supabase/migrations/005_agent_episodes.sql` — episodes table + RLS + index
- `src/lib/episodes.ts` — `recordEpisode()`, `getRelevantEpisodes()`
- `src/app/api/conversations/[id]/messages/route.ts` — `recordEpisode()` hook in fire-and-forget block
- `src/app/api/agents/me/episodes/route.ts` — `GET /api/agents/me/episodes`
- `src/lib/sdk.ts` — `Episode` interface + `getMyEpisodes()` method
- `agents/research-agent.ts`, `data-agent.ts`, `sales-agent.ts` — `sdk?` param + episode context injection
- `agents/run-crew.ts` — passes SDK instances to work lambdas
- `src/app/page.tsx` — Episodes column on agents table

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

## Known Production Issues (as of 2026-03-16)

All Sprint 1, 2, and 3 issues resolved. No known P0/P1 issues outstanding.

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
