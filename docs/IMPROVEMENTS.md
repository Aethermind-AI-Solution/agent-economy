# Pending Improvements — Agent Economy Platform

Last updated: 2026-03-13
Status: Queued for next session

---

## 🔴 Fix Immediately (Annoying / Broken)

### 1. Suppress dotenv verbose output
**File:** All agent files (`research-agent.ts`, `data-agent.ts`, `sales-agent.ts`, `run-crew.ts`, `pixel-forge.ts`, `procure-bot.ts`)
**Problem:** Every run prints 4 lines of dotenv marketing tips — noisy and unprofessional.
**Fix:** Add `quiet: true` to all `dotenv.config()` calls:
```typescript
dotenv.config({ path: '...', quiet: true });
```

### 2. Platform connectivity check before crew starts
**File:** `agents/run-crew.ts`
**Problem:** If the dev server is down, the crew registers agents (slow), then fails on first API call with a confusing error.
**Fix:** Add a ping to `/api/agents/me` (or just a health check) before calling `registerAllAgents()`. Fail fast with a clear message: `"FATAL: Platform at http://localhost:3001 is not reachable. Run: npm run dev"`.

---

## 🟠 GUI Gaps (Visible to Users / CTO)

### 3. Conversation detail: render outreach drafts as readable cards
**File:** `src/app/conversations/[id]/page.tsx`
**Problem:** The `delivery_payload` for outreach drafts is displayed as a raw JSON blob — completely unreadable.
**Fix:** Detect `delivery_payload.artifacts[0].type === "outreach_drafts"` and render each draft as a formatted card with:
- Company name + score badge
- Subject line highlighted
- Email body in a readable block
- LinkedIn message in a separate section
Similarly for `scored_leads` — render as a table instead of JSON.

### 4. Dashboard: show search query on conversation rows
**File:** `src/app/page.tsx`
**Problem:** Conversations table shows `service_type` (e.g., `lead_enrichment`) but can't tell which crew run it belongs to. The search query is buried in `rfq_payload.query`.
**Fix:** In the conversations table, add a "Query / Notes" column that shows `rfq_payload.query` (truncated to 40 chars) when present. This lets the admin see "healthcare companies in India..." directly in the row.

### 5. Dashboard: add disputed count to stats bar
**File:** `src/app/page.tsx` (line ~241)
**Problem:** Stats bar shows 5 cards (Agents, Completed, Active, Volume, Fees) but no Disputes count. Disputes are only visible by scrolling to the bottom section.
**Fix:** Add a 6th stat card (red highlight) between Active Transactions and Total Volume:
```tsx
<div className="stat">
  <div className="stat-label">Disputes</div>
  <div className="stat-value red">{disputedTx.length}</div>
</div>
```

### 6. Dashboard: replace 5s auto-refresh with manual refresh button
**File:** `src/app/page.tsx` (line ~77)
**Problem:** `<meta httpEquiv="refresh" content="5;url=...">` reloads the entire page every 5 seconds, jumping scroll position and interrupting reading.
**Fix:** Remove the meta refresh. Add a "Refresh" button in the header that reloads the page on click. Optionally show a "Last updated: HH:MM:SS" timestamp.

---

## 🟡 Code Quality (Lower Urgency)

### 7. Add timeout to crew steps
**File:** `agents/run-crew.ts`
**Problem:** The `work()` function inside `platformHandoff()` has no timeout. If Claude API hangs, the crew waits forever.
**Fix:** Wrap the `work()` call with a `Promise.race` against a timeout:
```typescript
const result = await Promise.race([
  work(),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Step timed out after 120s')), 120_000)
  )
]);
```

### 8. Resolve stuck conversation `b6bf0cfc`
**Problem:** Conversation `b6bf0cfc-8d55-4617-8b0c-aa79d23da464` is in `accepted` state (from a failed run) with $1 locked in escrow. ResearchAgent balance shows $22 instead of $25 (3 failed runs worth of stuck escrow).
**Fix:** Admin should manually dispute/resolve via Supabase. Long-term: add an `expires_at` cleanup cron job.

### 9. Input validation on crew query
**File:** `agents/run-crew.ts` (line ~91)
**Problem:** `process.argv[2]` is not validated — empty string or whitespace-only is accepted and passed to Claude.
**Fix:**
```typescript
if (!query?.trim() || query.trim().length < 10) {
  console.error('Query must be at least 10 characters.');
  process.exit(1);
}
```

### 10. Git-leak warning when saving API keys
**File:** All agent registration helpers
**Problem:** API keys are appended to `.env.local` silently. No reminder that this file must never be committed.
**Fix:** After `fs.appendFileSync(...)`, log:
```
⚠️  API key saved to .env.local — ensure this file is in .gitignore
```
