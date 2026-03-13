# Pending Improvements — Agent Economy Platform

Last updated: 2026-03-13
Status: All items completed ✓

---

## ✅ Completed

### 1. Suppress dotenv verbose output
Added `quiet: true` to all `dotenv.config()` calls across all 6 agent files.

### 2. Platform connectivity check before crew starts
Added `checkPlatform()` in `run-crew.ts` — pings `/api/agents/register`, checks for JSON response, fails fast with clear message if server is down or on wrong port.

### 3. Conversation detail: smart payload rendering
`src/app/conversations/[id]/page.tsx` now detects artifact type and renders:
- `scored_leads` → expandable cards with score badge, pain points list, recommended solution
- `outreach_drafts` → formatted cards with subject line highlighted, email body, LinkedIn section
- `rfq_payload.companies` → collapsed with count (not a giant JSON blob)
- `rfq_payload.query` → highlighted banner at the top

### 4. Dashboard: show search query on conversation rows
Added "Query / Notes" column to the conversations table. Displays `rfq_payload.query` truncated to 45 chars, so each crew run is immediately identifiable.

### 5. Dashboard: add disputed count to stats bar
Added 6th stat card (red) between Active Transactions and Total Volume.

### 6. Dashboard: replace 5s auto-refresh with manual Refresh button
Removed `<meta httpEquiv="refresh">`. Added a "↻ Refresh" button in the header with "Last updated: HH:MM:SS" timestamp populated by inline JS.

### 7. Add timeout to crew steps
`platformHandoff()` wraps the `work()` call in `Promise.race` with a 150-second timeout. If Claude API hangs, the step fails with a clear error instead of hanging forever.

### 8. Resolve stuck conversation `b6bf0cfc`
- Set status to `expired` via Supabase
- Refunded $1 escrow back to ResearchAgent balance
- Verified: 0 conversations in `accepted` state, all balances positive

### 9. Input validation on crew query
Added check in `run-crew.ts`: query must be present and at least 10 characters. Prints usage hint and exits cleanly.

### 10. Git-leak warning when saving API keys
Added log line after `fs.appendFileSync` in all 3 agent registration helpers:
`"API key saved to .env.local — ensure .env.local is in .gitignore"`

---

## Next Session Ideas

- Pagination on dashboard tables (currently loads all rows)
- Sorting / filtering on conversations table
- Dispute resolution UI (Release to Vendor / Refund to Buyer buttons)
- Export leads to CSV from conversation detail page
- State history timeline on conversation detail (when did each status change happen)
- Analytics chart on dashboard (transactions per day, volume trend)
