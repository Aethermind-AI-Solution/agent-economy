# Lessons Learned — Agent Economy Platform

Last updated: 2026-03-18

---

## Lead Generation Crew Build (2026-03-13)

### Bug Fixes

#### 1. `max_tokens: 4096` too small for 30-50 company JSON responses
**Symptom:** `Unterminated string in JSON at position 15436` — Claude's response was cut off mid-JSON.
**Root cause:** 50 companies × ~5 fields × ~60 chars ≈ 15,000+ chars, which exceeds 4096 tokens.
**Fix:** Increased `max_tokens` to `8192` in all three agents (`research-agent.ts`, `data-agent.ts`, `sales-agent.ts`).
**Rule:** For any Claude call that returns a list of 20+ structured objects, use at least `max_tokens: 8192`.

#### 2. Dev server was on port 3001, not 3000
**Symptom:** Registration returned HTML (Next.js page) instead of JSON — another Next.js app was running on port 3000.
**Root cause:** `PLATFORM_URL=http://localhost:3000` in `.env.local` but `npm run dev` started on 3001 (port 3000 occupied by Docker).
**Fix:** Updated `.env.local` to `PLATFORM_URL=http://localhost:3001`.
**Rule:** Always check which port `npm run dev` actually started on. Use `lsof -i :3000 -i :3001 -i :3002` to find the right port.

#### 3. Registration returned empty error `{}`
**Symptom:** `FATAL: Registration failed: {}` — the server returned HTML (not JSON) and `.json()` parsed it as empty.
**Root cause:** Wrong platform URL (port 3000 → wrong app). The HTML page's `.json()` parse silently returned `{}`.
**Fix:** Better error logging in register helpers — log the raw response status code and first 200 chars of body before trying to parse.
**Rule:** When a fetch response isn't JSON, the `.json()` call throws or returns garbage. Always check `res.ok` and `Content-Type` header before parsing.

#### 4. dotenv verbose output (4 lines of tips per run)
**Symptom:** Every `npx tsx agents/*.ts` run prints 4 lines like `[dotenv@17.3.1] injecting env (9) from .env.local -- tip: ...`
**Root cause:** dotenv v17 added verbose logging by default. Each of the 4 agent files calls `dotenv.config()` separately (4 calls per `run-crew.ts` run).
**Fix (pending):** Add `quiet: true` to all `dotenv.config()` calls.

#### 5. `fs.appendFileSync` creates duplicate keys on re-runs
**Symptom:** If `.env.local` already has `RESEARCH_AGENT_KEY` but `process.env` is reset (e.g., new terminal), registration is skipped correctly because dotenv loads the key. No actual bug — but confusing.
**Note:** dotenv's default `override: false` means existing env vars aren't overwritten. The `if (process.env[KEY])` check works correctly because dotenv runs at module load time before the check.

---

### Architecture Decisions

#### 6. ESM import hoisting with dotenv
**Problem:** In ESM modules, `import` statements are hoisted before any code runs. You cannot put `dotenv.config()` before imports to affect those modules.
**Resolution:** Each agent file calls `dotenv.config()` at its own module-level top. When `run-crew.ts` imports them, each module loads its own env before setting module-level constants like `PLATFORM_URL`. This is self-contained and correct.
**Rule:** In ESM projects, always call `dotenv.config()` at the top of each file that needs env vars, not just at the entrypoint.

#### 7. Synchronous crew flow (no polling) works cleanly
**Decision:** `run-crew.ts` drives both sides of every conversation directly (as both buyer and vendor SDK). No polling loops, no `waitForStatus()` needed.
**Why it works:** The orchestrator holds both SDKs in memory and can call `vendorSdk.sendMessage()` and `buyerSdk.sendMessage()` in the right order synchronously.
**Trade-off:** The crew doesn't demonstrate the "async agent polling" pattern — both agents are driven by one process. For production, each agent would run independently and use `waitForStatus()`. Fine for demo/MVP.

#### 8. Data passes through `rfq_payload`, not a database
**Decision:** ResearchAgent's output (50 companies) is passed to DataAgent via `rfq_payload` in `createConversation()`. No separate database table needed.
**Limitation:** `rfq_payload` is JSONB — fine for up to ~50 companies (~15KB). For larger payloads, would need an S3/storage URL instead.
**Rule:** Keep JSONB payloads under ~50KB. For large datasets, store in object storage and pass the URL.

#### 9. Agent types and starting balances
- `buyer` → starts with $25.00
- `both` → starts with $25.00 (has both buyer and vendor capabilities)
- `vendor` → starts with $0.00
- **Implication:** SalesAgent (vendor-only) starts at $0 — cannot initiate transactions. Only receives payments. DataAgent (`both`) can be a buyer in the second handoff because it earned $0.95 in the first.

---

### Platform Observations

#### 10. Conversation stuck in `accepted` after failed run
**What happened:** First crew run failed mid-execution (DataAgent JSON parse error). The conversation was left in `accepted` state with $1 locked in ResearchAgent's escrow. ResearchAgent balance dropped from $25 → $24 with no delivery.
**Current state:** Conversation `b6bf0cfc-8d55-4617-8b0c-aa79d23da464` is stuck.
**Fix (manual):** Resolve via Supabase admin — either deliver/confirm or dispute/freeze.
**Long-term fix:** Add an `expires_at` cron cleanup for conversations stuck in intermediate states.

#### 11. 5% platform fee applies to crew transactions
**Observation:** On $1.00 internal crew transactions, vendor receives $0.95 and platform takes $0.05.
**Impact on balances after 2 runs (healthcare + SMB):**
- ResearchAgent: $25.00 → $22.00 (paid $1 × 3 attempts including stuck)
- DataAgent: $25.00 → $24.90 (paid $1, received $0.95 × 2 runs as vendor)
- SalesAgent: $0.00 → $1.90 (received $0.95 × 2 runs)

---

### Performance Notes

#### 12. Crew runtime breakdown (typical)
| Step | Time |
|------|------|
| Agent registration (3 agents, parallel) | ~2s |
| ResearchAgent → Claude (50 companies) | ~75-90s |
| Platform handoff 1 (Supabase calls) | ~5s |
| DataAgent → Claude (enrich + score 50) | ~80-85s |
| Platform handoff 2 | ~5s |
| SalesAgent → Claude (10 drafts) | ~70-80s |
| **Total** | **~4 minutes** |

**Bottleneck:** Claude API calls (3 sequential calls, each 70-90s). Parallelizing isn't possible since each step depends on the previous output.

#### 13. Token usage per run
| Step | Model | max_tokens | Typical output |
|------|-------|-----------|----------------|
| findCompanies | claude-opus-4-6 | 8192 | ~15,000 chars (50 companies) |
| enrichAndScore | claude-opus-4-6 | 8192 | ~17,000 chars (20 leads) |
| draftOutreach | claude-opus-4-6 | 8192 | ~14,000 chars (10 drafts) |

---

## Architecture Planning Session (2026-03-15)

### Lesson 14: agent_type vs agent_role — different axes, don't conflate

**Problem:** The spec for orchestrator/worker asked for an `agent_type: 'orchestrator' | 'worker'` field —
but the agents table already has `type: 'buyer' | 'vendor' | 'both'`. These are completely different dimensions.

- `type` = **marketplace role** (who initiates payment, who delivers)
- `agent_role` = **hierarchy position** (who coordinates, who executes)

An orchestrator agent can simultaneously be `type: both` (buys from workers, sells to clients) and `agent_role: orchestrator`.

**Rule:** Never conflate marketplace role with architectural hierarchy. Use `agent_role` as a separate column.

---

### Lesson 15: model_provider is advisory metadata, not platform-enforced routing

**Problem:** Spec said "platform routes by model_provider preference."
The platform never calls AI APIs — agents do that locally with their own keys.

**Clarification:** `model_provider` is self-declared metadata on the agent profile.
The platform can filter search results by it, but cannot verify or enforce it.
Routing config is a preference hint that influences worker selection scoring — not a hard constraint.

**Rule:** Any "model routing" on this platform is advisory. Document it as preference-based, not guarantee-based.

---

### Lesson 16: Subthread reuse requires atomic DB claim to prevent race conditions

**Problem:** Checking worker `status = 'idle'` and then setting it to `'busy'` in two steps
creates a TOCTOU (time-of-check/time-of-use) race. Two orchestrators can both see the same idle
worker simultaneously and both try to claim it.

**Fix:** Use a single atomic CAS (compare-and-swap) update:
```sql
UPDATE agents
SET status = 'busy', last_active_at = now()
WHERE id = $1 AND status = 'idle'
RETURNING *;
```
If `RETURNING` is empty, the worker was already claimed — try the next candidate.

**Rule:** Any "check-then-act" on shared mutable state must use a single atomic DB operation.

---

### Lesson 17: In-memory rate limiter is broken on Vercel serverless

**Problem:** `rate-limit.ts` uses `Map<string, RateEntry>` stored in module-level memory.
On Vercel, each cold start creates a new function instance with a fresh Map.
Result: each agent gets a fresh rate limit window on every cold start — the limiter does nothing.

**Fix:** Replace with a Supabase table:
```sql
CREATE TABLE agent_rate_limits (
  agent_id    UUID REFERENCES agents(id),
  window_start TIMESTAMPTZ,
  request_count INTEGER,
  PRIMARY KEY (agent_id, window_start)
);
```
pg_cron deletes rows older than the window. Supabase is shared across all Vercel instances.

**Rule:** Never store rate limit state in process memory for serverless functions. Always use a shared external store.

---

### Lesson 18: Build sequentially — each sprint is a hard dependency for the next

**Dependency chain discovered during planning:**
- Sprint 3 (episodes) → Sprint 4 needs `episode_id FK` in agent_threads
- Sprint 3 (getRelevantEpisodes) → Sprint 7 needs it for episode-primed warm starts
- Sprint 4 (spawnWorker) → Sprint 7 needs its routing logic to add model preference
- Sprint 5 (trust scores) → Sprint 6 needs them before opening to external vendors
- Sprint 6 (Stripe) → Sprint 8 marketplace launch requires working payments

**Rule:** Don't start Sprint N+1 until Sprint N's foundation tickets (first 3–4 items) are done.
Feature tickets within a sprint can overlap, but cross-sprint dependencies are hard.

---

### Lesson 19: dotenv belongs only in CLI agent files, not in Next.js API routes

**Problem:** dotenv is called in some lib/ files. Next.js API routes run on Vercel, where env vars
are injected by the platform at build/runtime — dotenv is not needed and causes confusion.

**Rule:**
- CLI agent files (`agents/*.ts`) → `dotenv.config()` is required (they run as Node processes)
- Next.js API routes (`src/app/api/**`) → Never call dotenv. Use `process.env.X` directly.
- Shared lib files (`src/lib/**`) → Never call dotenv. They run in both contexts; let the caller load env.

Guard pattern for any shared util that might be called from both contexts:
```typescript
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'production') {
  // Only load dotenv in non-production Node.js contexts
}
```

---

## Sprint 2 Testing Session (2026-03-15)

### Lesson 20: Fixed-window rate limiter test must stay within one window

**Problem:** Testing the rate limiter by sending 62 sequential HTTP requests appeared to fail — all requests returned 200. But the rate limiter IS working.

**Root cause:** Vercel serverless cold starts make the first requests slow (~1-2s each). 62 sequential requests at ~1s each = ~62 seconds — crossing 2 minute boundaries. The counts were split: `09:40: 10, 09:41: 42, 09:42: 10`. No single window reached 60.

**Rule:** To test a fixed-window rate limiter, send requests in parallel (not sequentially) to ensure they land in the same window. Alternatively, verify directly against the counter table after the test.

**Diagnostic:** Query `agent_rate_limits` table directly to see actual counts per window:
```sql
SELECT * FROM agent_rate_limits WHERE key = '{agent_id}' ORDER BY window_start DESC LIMIT 5;
```

---

### Lesson 21: GET handlers were missing rateLimit() — Sprint 1 oversight

**Problem:** Sprint 1 added `await rateLimit(agent!.id)` to POST/PATCH handlers but forgot to add it to GET handlers:
- `GET /api/agents/me` — no rate limit
- `GET /api/conversations` — no rate limit

**Fix:** Added `await rateLimit(agent!.id)` to both GET handlers in Sprint 2 testing.

**Rule:** When adding rate limiting to a route file, check ALL exported HTTP method handlers (GET, POST, PATCH, etc.), not just the first one.

---

### Lesson 22: Next.js SSR embeds component JSON alongside rendered HTML

**Observation:** When checking for "Export CSV" in the page HTML, `grep -c` returns 2 instead of 1 even though the button renders once visually.

**Root cause:** Next.js Server Components serialize the component tree as JSON and embed it in the HTML for hydration. The button text appears once in the rendered HTML and once in the JSON payload (`__next_f` script).

**Rule:** When grepping for visible text in Next.js SSR pages, expect 2 occurrences of any rendered string — once in HTML, once in the embedded component JSON. This is normal and not a bug.

---

### Lesson 23: conversation_events only captures events AFTER migration + deployment

**Observation:** Only 2 of 14 conversations had a State Timeline. The other 12 showed nothing.

**Root cause:** The `conversation_events` table didn't exist when the 12 older conversations were created. The fire-and-forget insert (`Promise.all([supabase.from("conversation_events").insert(...)...]).catch(...)`) silently drops on table-not-found errors.

**Rule:** Audit log tables are append-only and only capture events going forward from when they were created. Pre-existing data has no retroactive event history. Document this clearly in UI — e.g., "State timeline available for transactions from [date]".

---

---

## Bug Fix Pass (2026-03-17)

### Lesson 29: `contacted_at` overwrite — always check before setting timestamps

**Bug:** `updateDraftPipeline()` had `update.contacted_at = new Date().toISOString()` unconditionally whenever stage moved away from `new`. Moving a lead from `contacted → replied → interested` reset the original contact timestamp each time.
**Fix:** Read `contacted_at` from DB first. Only add it to the update payload when currently null.
**Rule:** Any "first-touch" timestamp must be treated as write-once. Always read before write, or use SQL `COALESCE(contacted_at, now())`.

---

### Lesson 30: Non-null assertions (`!`) are silent lies — initialize instead

**Bug:** `let scoredLeads: any[]` (no initializer) + `scoredLeads!.length` suppressed a valid TypeScript error. If the callback threw before assignment, `scoredLeads` was `undefined` at usage, producing a confusing TypeError.
**Fix:** `let scoredLeads: ScoredLead[] = []` + remove `!`. An empty array is a safe default; add an explicit length guard after the step that populates it.
**Rule:** Never use `!` to suppress an uninitialized variable warning. Initialize to a safe default and add a guard at the boundary where empty means "abort".

---

### Lesson 31: Dead code removal can silently kill live features

**Bug:** Removing `findCompanies()` (the dead single-query fallback) also removed the `sdk.getMyEpisodes()` call inside it — silently breaking ResearchAgent's episode context injection. DataAgent and SalesAgent still loaded episodes; ResearchAgent didn't. No error, no warning.
**Fix:** Restored `getMyEpisodes("lead_enrichment", 3)` inside `findCompaniesParallel()`, merging episode context with the meta-strategy before passing to sub-queries.
**Rule:** When deleting a function, search for all features it provides — not just its call sites. Dead code may be the only place a feature is implemented. Use grep to confirm no behavior is lost.

---

### Lesson 32: Optional security checks are open security holes

**Bug:** `if (adminPassword && key !== adminPassword)` — if `ADMIN_PASSWORD` env var is unset, the entire condition is false and the endpoint is completely open in production.
**Fix:** Separate the "missing var" case from the "wrong key" case. Return 500 (misconfiguration) when the var is missing in production; allow in local dev for convenience.
**Rule:** Any auth check that depends on an env var must treat the missing-var case as an error in production, not as "allow all". Pattern: `if (!secret) { if (prod) return 500; } else if (key !== secret) return 401`.

---

### Lesson 33: Slow auth paths need observability before they become incidents

**Context:** The O(n) bcrypt scan in `auth.ts` fires for any agent with a null `api_key_prefix`. Each bcrypt comparison takes ~80ms. With 50 agents = 4 seconds per request. No log was emitted, so this was invisible in production.
**Fix:** Added `console.warn(JSON.stringify({ event: "auth_slow_path_triggered" }))` before the loop.
**Rule:** Any code path that degrades linearly with data size must emit a structured log when triggered. Slow paths that are silent become incidents when the data grows.

---

## Sprint 3 Testing Session (2026-03-16)

### Lesson 25: Episode rows are fire-and-forget — always sleep before asserting

**Observation:** After the `confirm` message returned 200, immediately querying `/api/agents/me/episodes` returned `[]`.
After a 2-second sleep, the rows were present.

**Root cause:** `recordEpisode()` is called inside a `Promise.all(...).catch(...)` block that is NOT awaited.
The HTTP response is sent first; the DB insert happens concurrently on the same event loop.
The insert completes within ~200ms but the test hit it before that window closed.

**Rule:** When testing fire-and-forget side effects (audit log, episode recording, idempotency cache),
always wait at least 1-2 seconds after the triggering response before asserting the side-effect rows.

---

### Lesson 26: `UNIQUE (agent_id, conversation_id)` prevents double-recording on retry

**Design:** The `agent_episodes` table has a unique constraint on `(agent_id, conversation_id)`.

**Benefit:** If the `confirm` message is retried (e.g., idempotency key collision), `recordEpisode()` is called
again. The second `INSERT` fails with a unique violation, but the `.catch()` on `Promise.all` swallows it.
No duplicate episodes are written.

**Rule:** Always add a unique constraint on any append-only side-effect table that could be written
from a retry-safe endpoint. Let the DB enforce idempotency at the storage layer.

---

### Lesson 27: Each agent's task_type is their OWN service_type, not the conversation's

**Problem during crew integration:** ResearchAgent is the *buyer* of `lead_enrichment` service.
DataAgent is the *vendor*. When ResearchAgent calls `getMyEpisodes("lead_enrichment")`,
it correctly returns its buyer-role episodes — because `recordEpisode()` writes one row per role,
both keyed to the conversation's `service_type`.

**Verified:** Both ResearchAgent (role=buyer) and DataAgent (role=vendor) return episodes
with `task_type: "lead_enrichment"` from the same conversation. `getMyEpisodes()` filters
by `agent_id`, so each agent sees only its own rows.

**Rule:** The `task_type` to pass to `getMyEpisodes()` is always the `service_type` of the
conversation — regardless of whether the agent was buyer or vendor in that conversation.

---

### Lesson 28: SalesAgent gets 0 past episodes on first run — expected behaviour

**Observation:** In the first crew run after Sprint 3 deployment, the log showed:
```
[DataAgent] Loaded 2 past episode(s) for context   ← had 2 test episodes from manual testing
[ResearchAgent] Loaded 2 past episode(s) for context
[SalesAgent] Loaded 0 past episode(s) for context  ← first outreach_drafting run ever
```
The second crew run showed `Loaded 1 past episode(s) for context` for SalesAgent.

**This is correct.** Episodes accumulate progressively. The system degrades gracefully
(`formatEpisodesForPrompt([])` returns `""` — no context appended, no prompt change).

**Rule:** Document that episode-enhanced output only appears from the **second run onward** for each agent.
First run is always zero context. The crew logs make this transparent.

---

### Lesson 24: Supabase REST API is the fastest way to verify RPC and table state

**Pattern used during Sprint 2 testing:**
```bash
# Test an RPC function directly
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/check_rate_limit" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_key":"test","p_window_start":"2026-03-15T09:00:00.000Z","p_limit":3}'

# Query a table directly
curl -s "$SUPABASE_URL/rest/v1/agent_rate_limits?key=eq.{id}&order=window_start.desc" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
```
Faster than writing a test script and avoids Vercel cold start noise.

---

## Security & Bug Fixes (2026-03-18)

### Lesson 25: Unauthenticated export endpoints are a silent P0

**What happened:** `GET /api/conversations/:id/export` had `_req` (unused request param) and zero auth — any person knowing a conversation UUID could download the full CSV of leads/outreach drafts. This went unnoticed because the endpoint "worked" and returned data.

**Rule:** Export and download endpoints are high-value targets. Every endpoint that returns data must call `authenticate()` first — even read-only ones. Adding `_req` (underscore) to silence a lint warning is a red flag that auth was skipped.

---

### Lesson 26: Fail-open auth is worse than no auth

**What happened:** `GET /api/crew-runs/:id/export` had:
```typescript
if (adminPassword) {          // ← if env not set, this block is skipped entirely
  if (key !== adminPassword) return 401;
}
```
If `ADMIN_PASSWORD` is unset, every request is allowed through silently. The fix: always fail closed.
```typescript
if (!adminPassword) return 500;  // misconfiguration
if (key !== adminPassword) return 401;
```
**Rule:** Auth guards must fail closed. `if (secret) { check }` fails open. `if (!secret) { reject }` fails closed. Always use the second pattern.

---

### Lesson 27: SSRF via webhook_url requires two layers of protection

**What happened:** Agents can register a `webhook_url`. The platform fetches that URL on every state transition. Without validation, an attacker sets `webhook_url: "http://169.254.169.254/latest/meta-data/"` and the platform leaks AWS credentials.

**Fix implemented (two layers):**
1. **Schema validation** (`isSafeWebhookUrl()` in validation.ts) — blocks private IPs at registration and update time
2. **Delivery-time re-validation** (webhook.ts) — re-checks before every fetch, catches any URLs that bypassed validation

**Rule:** Any user-supplied URL that the server will fetch must be validated for SSRF. Private ranges to block: `localhost`, `127.x`, `169.254.x` (cloud metadata), `10.x`, `172.16-31.x`, `192.168.x`, private IPv6.

---

### Lesson 28: Public endpoints without rate limits are enumeration targets

**What happened:** `/api/services/search`, `/api/marketplace`, and `/api/marketplace/:id` were public and had zero rate limiting. An attacker could enumerate all agents, scrape all capabilities and pricing, or discovery-scan all UUIDs.

**Fix:** Added IP-based rate limiting to all public endpoints:
```typescript
const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
const rateLimited = await rateLimit(`marketplace:${ip}`);
```
**Rule:** Every endpoint needs rate limiting. Authenticated endpoints limit per agent ID. Public endpoints limit per IP. No exceptions.

---

### Lesson 29: Stale cleanup queries must use columns that are actually written

**What happened:** The crew-run stale cleanup queried `.lt("started_at", ...)` but `createCrewRun()` only inserts `{ query }` — `started_at` is never set, so it's always NULL. `NULL < timestamp` is false in Postgres, so the cleanup never fired and stale "running" records accumulated forever.

**Fix:** Changed to `.lt("created_at", ...)` which is always populated.

**Rule:** Before writing a cleanup/expiry query on a column, verify that column is actually being written at insert time. NULL comparisons in Postgres always return NULL (falsy), not true.

---

### Lesson 30: Validate vendor capabilities before creating a conversation

**What happened:** `POST /api/conversations` accepted any `service_type` string and created the conversation regardless of whether the vendor actually offered that service. A buyer could send an RFQ for `"space_travel"` to an image-generation vendor.

**Fix:** After fetching the vendor, check that `service_type` is in `vendor.capabilities`:
```typescript
const offersService = capabilities.some(c => c.service_type === service_type);
if (!offersService) return 400;
```
**Rule:** When creating a relationship between two entities, validate that the relationship is valid (vendor offers the service, user has the role, etc.) before inserting.

---

### Lesson 31: `console.log` vs `console.error` matters for production observability

**What happened:** Webhook delivery failures were logged with `console.log` (INFO level). In production log aggregators (Datadog, CloudWatch, Vercel logs), INFO and ERROR are separate streams. Webhook failures were invisible in error dashboards.

**Rule:** Errors and failures go to `console.error`. Expected/informational events go to `console.log`. This determines which alerts fire and which log queries find problems.

---

### Lesson 32: Non-atomic read-modify-write creates silent data corruption

**What happened:** `evolution_version` increment was done in two queries:
1. Read: `const current = await supabase.select("evolution_version")`
2. Write: `await supabase.update({ evolution_version: current + 1 })`

Two concurrent PATCH requests both read version N and both write N+1. One increment is silently lost.

**Fix:** Combine into a single update — read current value and include the incremented result in the same `updates` object sent in one query.

**Rule:** Any counter increment must be atomic. Either: (a) include the increment in the same update query, (b) use a Postgres RPC with `SET col = col + 1`, or (c) use advisory locks. Never read-then-write a counter in two separate queries.
