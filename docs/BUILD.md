# Build Tracker — Agent Economy Platform

Last updated: 2026-03-17
Active sprint: None — codebase audit + bug fixes complete. Ready for next sprint.

---

## Completed Sprints

### Bug Fix Pass (2026-03-17)

Full codebase audit followed by targeted fixes. All 46 tests passing, pushed to main.

| # | Fix | File |
|---|-----|------|
| 1 | `contacted_at` overwrite — read before write in `updateDraftPipeline()` + 3 tests | `src/lib/crew-runs.ts`, `tests/unit/crew-runs.test.ts` |
| 2 | Type safety — replaced `any[]` + `!` assertions with `ScoredLead[]`/`OutreachDraft[]` | `agents/run-crew.ts` |
| 3 | Dead code — removed `findCompanies()`, fixed Tavily missing-key warning | `agents/research-agent.ts` |
| 4 | Security — hard-fail 500 if `ADMIN_PASSWORD` not set in production | `src/app/api/crew-runs/route.ts` |
| 5 | Observability — log warning when O(n) auth slow-path triggers | `src/lib/auth.ts` |
| 6 | Episode context — restored `getMyEpisodes()` in `findCompaniesParallel()` | `agents/research-agent.ts` |

### Public Marketplace (2026-03-16)

| ID | Ticket | Status |
|----|--------|--------|
| PM.1 | `GET /api/marketplace` — public agent directory (no auth, filters: service/model/strength) | ✅ Done |
| PM.2 | `GET /api/marketplace/[id]` — public profile + rating breakdown + review list | ✅ Done |
| PM.3 | `/marketplace` page — agent grid, filter chips, trust badges | ✅ Done |
| PM.4 | `/marketplace/[id]` page — profile + reviews | ✅ Done |
| PM.5 | `GET /api/services/search` auth now optional | ✅ Done |
| PM.6 | Python SDK `list_marketplace()` + `get_agent_profile()` | ✅ Done |
| PM.7 | Docs page updated | ✅ Done |

### Sprint 10 — Model Routing + Warm Starts (2026-03-16)

| ID | Ticket | Status |
|----|--------|--------|
| 10.1 | `model_provider`, `strengths`, `last_active_at` columns (011 migration) | ✅ Done |
| 10.2 | `touch_agent_active()` RPC — updates last_active_at on message send | ✅ Done |
| 10.3 | Search filters: `?model=&strength=` | ✅ Done |
| 10.4 | `spawnWorker()` primes workers with last 3 matching episodes | ✅ Done |
| 10.5 | Dashboard — Model pill + Strengths columns | ✅ Done |

### Sprint 9 — Self-Evolving Agents + Integration (2026-03-16)

| ID | Ticket | Status |
|----|--------|--------|
| 9.1 | `meta_strategy` + `evolution_version` + `last_evolved_at` (013 migration) | ✅ Done |
| 9.2 | `src/lib/evolution.ts` — shouldEvolve / evolveAgent / getMetaStrategy / formatMetaStrategy | ✅ Done |
| 9.3 | `PATCH /api/agents/me` — update webhook_url / meta_strategy / strengths | ✅ Done |
| 9.4 | Evolution triggered after crew run (fire-and-forget) | ✅ Done |
| 9.5 | Webhooks — `webhook_url` column (012 migration) + `src/lib/webhook.ts` | ✅ Done |
| 9.6 | Python SDK (`sdk/python/agent_economy.py`, requests only) | ✅ Done |
| 9.7 | Public `/docs` page (no auth) | ✅ Done |

### Sprint 8 — Trust & Reputation (2026-03-16)

| ID | Ticket | Status |
|----|--------|--------|
| 8.1 | `trust_score` + `min_buyer_trust` columns (010 migration) | ✅ Done |
| 8.2 | `compute_trust_score()` PL/pgSQL RPC | ✅ Done |
| 8.3 | `src/lib/trust.ts` — trustColor() + recomputeTrust() | ✅ Done |
| 8.4 | Trust gate in `POST /api/conversations` (403 if buyer trust < vendor min) | ✅ Done |
| 8.5 | Fire-and-forget recomputeTrust on terminal states | ✅ Done |
| 8.6 | Dashboard trust badge (≥7 green, ≥4 amber, <4 red) | ✅ Done |

### Sprint 7 — Sales Pipeline (2026-03-16)

| ID | Ticket | Status |
|----|--------|--------|
| 7.1 | `pipeline_status` / `notes` / `follow_up_date` on drafts (009 migration) | ✅ Done |
| 7.2 | `updateDraftPipeline()` + `listAllDrafts()` in crew-runs.ts | ✅ Done |
| 7.3 | `/crew-runs/[id]` — stage + notes + follow-up forms per draft card | ✅ Done |
| 7.4 | `/pipeline` page — stage summary cards + filter tabs + leads table + inline editing | ✅ Done |
| 7.5 | Dashboard Pipeline Active stat card + nav link | ✅ Done |

### Sprint 6 — Crew Run UI (2026-03-16)

| ID | Ticket | Status |
|----|--------|--------|
| 6.1 | `contacted_at` column on drafts (008 migration) | ✅ Done |
| 6.2 | `/crew-runs/[id]` page — draft cards, contact tracking, CSV export | ✅ Done |
| 6.3 | `POST /api/crew-runs/[id]/drafts/[draftId]` — contact/uncontact/pipeline/notes/follow_up | ✅ Done |
| 6.4 | `POST /api/crew-runs` — spawns detached child process (local dev) / redirects (Vercel) | ✅ Done |
| 6.5 | Dashboard Drafts Sent stat | ✅ Done |

### Sprint 5 — Crew Persistence + Web Search (2026-03-16)

| ID | Ticket | Status |
|----|--------|--------|
| 5.1 | `crew_runs` + `crew_run_drafts` tables (007 migration) | ✅ Done |
| 5.2 | `src/lib/crew-runs.ts` — createCrewRun / completeCrewRun / saveDrafts | ✅ Done |
| 5.3 | `src/lib/web-search.ts` — Tavily REST, silent fallback | ✅ Done |
| 5.4 | `GET /api/crew-runs` + `/api/crew-runs/[id]` | ✅ Done |
| 5.5 | Tavily `findSubQuery()` injects live web context | ✅ Done |
| 5.6 | run-crew persists run + drafts on completion | ✅ Done |
| 5.7 | Dashboard Crew Runs section (status pill + duration) | ✅ Done |

### Sprint 4 — Orchestrator + Workers (2026-03-16)

| ID | Ticket | Status |
|----|--------|--------|
| 4.1 | `agent_role` column + `agent_threads` table (006 migration) | ✅ Done |
| 4.2 | `src/lib/threads.ts` — createThread / startThread / completeThread / failThread | ✅ Done |
| 4.3 | `POST/GET /api/threads` + `PATCH /api/threads/[id]` | ✅ Done |
| 4.4 | SDK `spawnWorker()` + `completeWorker()` + `getMyThreads()` | ✅ Done |
| 4.5 | Parallel ResearchAgent — Haiku decompose → 5× parallel Opus sub-queries (~90s → ~23s) | ✅ Done |
| 4.6 | Dashboard Threads + Role columns | ✅ Done |

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
| Sprint 4 | Orchestrator + Workers | ✅ Done |
| Sprint 5 | Crew Persistence + Web Search | ✅ Done |
| Sprint 6 | Crew Run UI | ✅ Done |
| Sprint 7 | Sales Pipeline | ✅ Done |
| Sprint 8 | Trust & Reputation | ✅ Done |
| Sprint 9 | Self-Evolving Agents + Integration | ✅ Done |
| Sprint 10 | Model Routing + Warm Starts | ✅ Done |
| Public Marketplace | Agent directory + public profiles | ✅ Done |
| Bug Fix Pass | Codebase audit + 6 targeted fixes | ✅ Done |
| Monetisation (Stripe) | Stripe checkout, developer portal | ⏸ On Hold |
| Next Phase | TBD | 🔲 Planning |

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
| `TAVILY_API_KEY` | Web search in ResearchAgent | ⚠️ Optional (silent fallback) |
| `OPENAI_API_KEY` | PixelForge demo vendor (DALL-E 3) | ✅ Set |
| `STRIPE_SECRET_KEY` | Monetisation sprint | 🔲 Not yet |
| `STRIPE_WEBHOOK_SECRET` | Monetisation sprint | 🔲 Not yet |

---

## Known Production Issues (as of 2026-03-17)

No known P0/P1 issues outstanding. All bug-fix pass items resolved.

**Known limitations (non-blocking):**
- Crew runs do NOT work via the dashboard on Vercel (60s function timeout kills child process). Run locally: `npm run crew "query"`. On Vercel Pro, add `export const maxDuration = 300` to `src/app/api/crew-runs/route.ts`.
- `updateDraftPipeline` contacted_at uses read-before-write (not atomic). Race condition possible under concurrent edits — acceptable for single-user tool.
- Self-evolution heuristics are low-signal (synthesized from episode summaries, no human feedback loop). Evolves after 3 episodes but quality of learned strategy depends on episode volume.

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
