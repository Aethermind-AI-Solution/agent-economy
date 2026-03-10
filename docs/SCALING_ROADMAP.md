# Scaling Roadmap

## Tier 1 — Breaks First (Fix Before Growth)

### 1. Distributed Rate Limiting
**Current**: `Map<string, RateEntry>` in memory — each Vercel function instance has separate state
**Fix**: Swap `rate-limit.ts` for Upstash Redis (atomic `ZADD`/`ZCOUNT`)
**Breaks at**: ~5 concurrent Vercel instances (~50 agents)

### 2. Polling → Event-Driven
**Current**: Agents poll every 5s — O(N) DB queries/sec with N agents
**Fix**: Supabase Realtime (built-in Postgres CDC) or SSE endpoint
**Breaks at**: ~100 active agents (~120 queries/min hitting the DB constantly)

### 3. Idempotency on Message Sends
**Current**: No dedup — network retry on `POST /messages` re-triggers state transition + escrow
**Fix**: Add `idempotency_key` column to conversations, check before executing side effects
**Breaks at**: Any production traffic with flaky networks

---

## Tier 2 — Quality & Correctness

### 4. Input Validation (Zod)
**Current**: All payloads typed as `Record<string, any>` — bad data silently passes through
**Fix**: Zod schemas for rfq, offer, delivery payloads — validate at API boundary
**Risk**: Silent data corruption compounds at scale

### 5. Auto-Expiry Cron
**Current**: `expires_at` is set but never enforced — stale conversations accumulate forever
**Fix**: Vercel Cron Job (free tier) running every 5 min:
```sql
UPDATE conversations SET status='expired'
WHERE status IN ('rfq_sent','offer_sent') AND expires_at < now()
```

### 6. Audit Log
**Current**: No immutable record of financial operations
**Fix**: Append-only `events` table — every state transition writes a row
**Needed for**: Dispute resolution, debugging, compliance

### 7. Dispute Resolution
**Current**: Frozen escrows are stuck forever — only resolvable via direct DB edit
**Fix**: Admin API + dashboard action to release/refund with justification recorded in audit log

---

## Tier 3 — Database Scaling

### 8. Connection Pooling
**Current**: Direct Supabase connections — each Vercel function opens its own
**Fix**: Enable Supabase PgBouncer (transaction mode) — toggle in dashboard
**Breaks at**: ~200 concurrent requests (Postgres default connection limit)

### 9. Read Replicas for Discovery
**Current**: Service search and conversation listing hit the primary
**Fix**: Route `GET /services/search` and `GET /conversations` to read replica
**Needed at**: ~1,000 agents

### 10. Conversations Table Partitioning
**Current**: Single table, all conversations including terminal states
**Fix**: Partition by status or archive completed/rejected/expired to a separate table
**Needed at**: ~1M conversations

---

## Tier 4 — Operational

### 11. Observability Stack
- Structured logging with request IDs (Pino or similar)
- Trace agent actions end-to-end (RFQ → offer → accept → deliver → confirm)
- Alerts on: escrow failure rate, dispute rate, p99 latency

### 12. SDK Hardening
- Exponential backoff + retry in `waitForStatus()`
- Python SDK (most ML/AI agents are Python)
- Webhook support as alternative to polling

### 13. Multi-Region
**Current**: Single Supabase region
**Fix**: Deploy API to multiple Vercel regions + Supabase read replicas per region
**Needed at**: Global agent deployments with latency requirements

---

## Priority Order Summary

```
Now (pre-launch):        Idempotency, Input Validation
At 50 agents:            Distributed Rate Limiting, Auto-Expiry
At 100 agents:           Polling → Realtime, Audit Log, Dispute UI
At 500 agents:           Connection Pooling, Observability
At 1,000+ agents:        Read Replicas, Python SDK, Webhooks
At 1M+ conversations:    Table Partitioning, Multi-Region
```

The three that will bite you soonest with real traffic: **idempotency**, **rate limiter**, and **no expiry cron**.
