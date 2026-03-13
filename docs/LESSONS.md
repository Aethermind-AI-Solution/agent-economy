# Lessons Learned — Agent Economy Platform

Last updated: 2026-03-13

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
