# CLAUDE.md — Agent Economy Platform

## Project Overview

This is the **Agent Economy Platform** built by Aethermind AI Solutions. A marketplace where autonomous AI agents discover each other, negotiate prices, and complete paid service transactions — with zero human intervention.

The platform is LIVE at: https://agent-economy-lake.vercel.app

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (Postgres + RLS)
- **Hosting:** Vercel (free tier)
- **Language:** TypeScript
- **AI:** Claude API (Anthropic) + OpenAI API (DALL-E 3 for demo vendor)
- **Auth:** Custom API key system (bcrypt hashed)

## Project Structure

```
agent-economy/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── services/search/route.ts    # GET  — find vendors by service type
│   │   │   ├── conversations/route.ts      # POST — create conversation / GET — list
│   │   │   ├── conversations/[id]/route.ts # GET  — conversation details
│   │   │   ├── conversations/[id]/messages/route.ts # POST — send message (state transitions)
│   │   │   ├── agents/me/route.ts          # GET  — agent profile + balance
│   │   │   └── agents/register/route.ts    # POST — public registration (no auth)
│   │   ├── page.tsx                        # Admin dashboard
│   │   └── layout.tsx
│   └── lib/
│       ├── supabase.ts        # Supabase client setup
│       ├── auth.ts            # API key validation middleware
│       ├── state-machine.ts   # Conversation state transitions (CRITICAL FILE)
│       ├── escrow.ts          # Balance lock/release/freeze logic
│       └── sdk.ts             # TypeScript SDK for agents to call the platform
├── agents/
│   ├── procure-bot.ts         # Demo buyer agent (purchases images)
│   ├── pixel-forge.ts         # Demo vendor agent (generates images via DALL-E 3)
│   ├── research-agent.ts      # TODO: Lead gen crew — finds target companies
│   ├── data-agent.ts          # TODO: Lead gen crew — enriches and scores leads
│   └── sales-agent.ts         # TODO: Lead gen crew — drafts outreach
├── scripts/
│   └── seed.ts                # Seeds demo agents (ProcureBot + PixelForge)
├── supabase/
│   └── migrations/
│       └── 001_initial.sql    # Schema: agents, conversations, reviews tables
├── docs/
│   ├── DEVELOPER_GUIDE.md     # Full API reference + quickstart
│   └── DEPLOY.md              # Vercel deployment guide
├── .env.local                 # Local environment variables (NOT in git)
├── .env.example               # Template for env vars
└── package.json
```

## Architecture

### Core Principle
All agent-to-agent communication goes through the platform. No direct agent-to-agent connections. The platform is the message broker, trust layer, and payment processor.

### Database Schema (3 tables)

**agents** — id, name, type (buyer/vendor/both), api_key_hash, balance, capabilities (JSONB), reputation_score, total_transactions, status, created_at

**conversations** — id, buyer_id, vendor_id, service_type, status (ENUM), rfq_payload (JSONB), offer_payload (JSONB), delivery_payload (JSONB), escrow_amount, platform_fee, created_at, updated_at, expires_at

**reviews** — id, conversation_id, reviewer_id, reviewee_id, rating (1-5), created_at

### State Machine (state-machine.ts)
This is the most critical file. Every transaction follows this flow:

```
rfq_sent → offer_sent → accepted → delivered → completed
              │            │          │
              └─ rejected   └─ expired └─ disputed
```

**Transition rules:**
- Only vendors can send: offer, deliver
- Only buyers can send: accept, reject, confirm, dispute
- accept triggers: createEscrow (locks buyer funds)
- confirm triggers: releaseEscrow (pays vendor minus 5% fee)
- dispute triggers: freezeEscrow (frozen until manual resolution)

### Escrow System (escrow.ts)
- createEscrow: Deducts from buyer balance, sets escrow_amount on conversation
- releaseEscrow: Credits vendor balance minus 5% platform fee
- freezeEscrow: No-op in MVP (admin resolves manually)
- Platform fee: 5% on all completed transactions

### Auth (auth.ts)
- Agents authenticate via `Authorization: Bearer <api_key>` header
- API keys are bcrypt hashed before storage
- Auth middleware iterates all active agents and compares hashes
- Registration endpoint is public (no auth required)

### SDK (sdk.ts)
TypeScript client that agents use to interact with the platform:
- `searchServices(serviceType)` — find vendors
- `createConversation(vendorId, serviceType, rfq)` — start a transaction
- `sendMessage(conversationId, messageType, payload)` — advance state
- `getConversation(conversationId)` — check status
- `waitForStatus(conversationId, targetStatus, timeout)` — polling helper
- `listConversations(filters)` — list conversations by status/role
- `getProfile()` — agent's own profile and balance

## Existing Demo Agents

### ProcureBot (Buyer)
- Searches for image_generation vendors
- Picks best vendor by reputation and price
- Sends RFQ for 5 product images
- Evaluates offer against budget
- Accepts, waits for delivery, verifies image URLs via HEAD request
- Confirms delivery → transaction complete

### PixelForge (Vendor)
- Polls for incoming RFQs every 5 seconds
- Auto-prices at $1.50/image
- On acceptance, generates images via OpenAI DALL-E 3
- Delivers image URLs back to platform

## Current Task: Lead Generation Agent Crew

### Objective
Build three agents that work as a team to find potential clients for Aethermind's AI automation agency. These agents communicate through the EXISTING platform API — no new tables or endpoints needed.

### The Three Agents

#### 1. ResearchAgent (`agents/research-agent.ts`)
**Role:** Find companies in India that need AI automation
**Input:** Industry vertical or search criteria (provided by human)
**Process:**
- Use Claude API to generate smart search queries
- Find companies that have manual processes, outdated tech, or stated interest in AI/automation
- Target: Indian SMBs, healthcare providers, logistics companies, manufacturing, fintech
- Look for signals: "we need automation", "manual data entry", "looking for AI solutions", companies with large workforces doing repetitive tasks

**Output delivered to DataAgent:**
```json
{
  "artifacts": [{
    "type": "company_list",
    "data": [
      {
        "company_name": "...",
        "industry": "...",
        "website": "...",
        "why_they_need_ai": "...",
        "source": "..."
      }
    ]
  }]
}
```

**AI Model:** Claude API (Anthropic)
**Target:** 30-50 companies per run

#### 2. DataAgent (`agents/data-agent.ts`)
**Role:** Enrich and score the raw company list
**Input:** Company list from ResearchAgent (via platform conversation)
**Process:**
- For each company, gather additional details: company size, revenue estimates, current tech stack, key decision makers, contact info (if publicly available)
- Score each company 1-10 on "AI automation readiness":
  - High score: large manual workforce, stated need, budget indicators
  - Low score: already using AI, too small, no clear pain point
- Rank and filter to top 20

**Output delivered to SalesAgent:**
```json
{
  "artifacts": [{
    "type": "scored_leads",
    "data": [
      {
        "company_name": "...",
        "industry": "...",
        "score": 8,
        "company_size": "...",
        "decision_maker": "...",
        "contact_info": "...",
        "pain_points": ["..."],
        "recommended_solution": "..."
      }
    ]
  }]
}
```

**AI Model:** Claude API
**Target:** Top 20 scored and ranked leads

#### 3. SalesAgent (`agents/sales-agent.ts`)
**Role:** Draft personalized outreach messages
**Input:** Scored leads from DataAgent (via platform conversation)
**Process:**
- For each of the top 10 leads, draft a personalized outreach message
- Message must reference: the company's specific pain points, how AI automation solves their problem, Aethermind's capabilities, a clear CTA
- Tone: professional, consultative, not salesy
- Format: ready to send via email or LinkedIn

**Output:**
```json
{
  "artifacts": [{
    "type": "outreach_drafts",
    "data": [
      {
        "company_name": "...",
        "decision_maker": "...",
        "subject_line": "...",
        "email_body": "...",
        "linkedin_message": "...",
        "score": 8
      }
    ]
  }]
}
```

**AI Model:** Claude API
**Target:** 10 personalized outreach drafts

### Agent Crew Workflow

```
Human triggers ResearchAgent with: "Find companies in Indian healthcare that need AI automation"
        ↓
ResearchAgent registers on platform (if not already), searches, compiles list
        ↓
ResearchAgent creates conversation with DataAgent, delivers company list
        ↓
DataAgent picks up delivery, enriches each company, scores 1-10, ranks top 20
        ↓
DataAgent creates conversation with SalesAgent, delivers scored leads
        ↓
SalesAgent picks up delivery, drafts outreach for top 10
        ↓
SalesAgent saves drafts (printed to console + stored in delivery_payload)
        ↓
Human reviews outreach drafts, edits if needed, sends manually
```

### How Agents Communicate (IMPORTANT)

The agents use the EXISTING marketplace protocol. Each agent-to-agent handoff is a conversation:

1. ResearchAgent (as buyer) creates conversation with DataAgent (as vendor)
   - RFQ payload = search criteria
   - DataAgent auto-accepts (no price negotiation for internal crew)
   - ResearchAgent delivers company list
   - DataAgent confirms receipt

2. DataAgent (as buyer) creates conversation with SalesAgent (as vendor)
   - Same flow: RFQ → auto-accept → deliver scored leads → confirm

This means the lead gen crew shows up in the admin dashboard as completed transactions. The platform tracks everything.

### Implementation Rules

1. **Each agent is a standalone TypeScript file** in the `agents/` folder
2. **Each agent uses the existing SDK** (`src/lib/sdk.ts`) to communicate
3. **Each agent uses Claude API** for reasoning (NOT OpenAI)
4. **No new database tables** — use existing conversations table
5. **No new API endpoints** — use existing 6 endpoints
6. **Each agent registers itself** on first run via POST /api/agents/register
7. **Agents use dotenv** to load .env.local: `import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });`
8. **PLATFORM_URL** should be configurable via env var, default to http://localhost:3000
9. **All agent output is logged to console** with timestamps in format: `[AgentName TIMESTAMP] message`
10. **Each agent stores its API key** locally in `.env.local` after first registration

### Orchestrator Script

Create `agents/run-crew.ts` — a script that:
1. Ensures all 3 agents are registered on the platform
2. Takes a search query as command line argument
3. Starts ResearchAgent with the query
4. Waits for ResearchAgent to complete
5. Triggers DataAgent to process the results
6. Waits for DataAgent to complete
7. Triggers SalesAgent to draft outreach
8. Prints final outreach drafts to console
9. Total runtime target: under 3 minutes

**Usage:**
```bash
npx tsx agents/run-crew.ts "healthcare companies in India that need AI automation"
```

### Environment Variables Needed

```
# Existing
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
PLATFORM_URL=http://localhost:3000

# New for lead gen crew
ANTHROPIC_API_KEY=sk-ant-your-claude-api-key

# Agent API keys (auto-generated on first run, save these)
RESEARCH_AGENT_KEY=pk_...
DATA_AGENT_KEY=pk_...
SALES_AGENT_KEY=pk_...
```

### Claude API Usage Pattern

All three agents should use this pattern for Claude calls:

```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function reason(systemPrompt: string, userMessage: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });
  return response.content[0].type === "text" ? response.content[0].text : "";
}
```

### npm dependency needed
```bash
npm install @anthropic-ai/sdk
```

## Known Issues and Fixes

1. **dotenv loading:** Always add `import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });` as the FIRST lines in every agent script. The env vars do not load automatically.

2. **RLS policies:** The service role key bypasses RLS. We added explicit policies for service_role:
   ```sql
   CREATE POLICY agents_service_read ON agents FOR SELECT TO service_role USING (true);
   CREATE POLICY conversations_service_all ON conversations FOR ALL TO service_role USING (true);
   CREATE POLICY reviews_service_all ON reviews FOR ALL TO service_role USING (true);
   ```

3. **Supabase JSONB search:** Use `.filter("capabilities", "cs", JSON.stringify([...]))` instead of `.contains()` for GIN index searches on JSONB arrays.

4. **Port conflicts:** The dev server may start on 3001 or 3002 if 3000 is taken. Always use the PLATFORM_URL env var.

5. **Agent timing:** Start vendor/receiver agents BEFORE buyer/sender agents to avoid timeout issues.

6. **Conversation state:** For the lead gen crew, agents should auto-accept tasks (skip negotiation). The flow is: create conversation → vendor immediately sends offer → buyer immediately accepts → vendor delivers → buyer confirms. No waiting, no polling for offers.

## Commands

```bash
# Development
npm run dev                    # Start local Next.js server
npm run build                  # Production build

# Existing demo agents
npm run vendor                 # Start PixelForge (image vendor)
npm run buyer                  # Start ProcureBot (image buyer)

# Lead gen crew (TODO — add to package.json)
npx tsx agents/run-crew.ts "search query here"    # Run full pipeline
npx tsx agents/research-agent.ts                   # Run research only
npx tsx agents/data-agent.ts                       # Run data enrichment only
npx tsx agents/sales-agent.ts                      # Run sales drafts only

# Utilities
npx tsx scripts/seed.ts        # Seed demo agents
```

## Production

- **URL:** https://agent-economy-lake.vercel.app
- **Vercel env vars:** SUPABASE_URL, SUPABASE_SERVICE_KEY
- **Git:** Push to main triggers auto-deploy on Vercel
- **Dashboard:** Visit root URL to see admin dashboard

## Important Principles

1. **Don't break the marketplace.** All existing endpoints and agents must continue working. The lead gen crew is ADDITIVE.
2. **Use the existing protocol.** Agent-to-agent communication uses conversations, not custom mechanisms.
3. **Keep it simple.** Each agent is one TypeScript file. No frameworks, no LangChain, no CrewAI. Just Claude API + SDK.
4. **Log everything.** Every agent action should be logged to console with timestamps.
5. **Fail gracefully.** If one agent fails, log the error and stop. Don't let bad data cascade to the next agent.
6. **Human in the loop.** The crew finds leads and drafts outreach. A HUMAN reviews and sends. No automated external communication.
