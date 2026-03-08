# Deploying Agent Economy

Complete guide to deploy the Agent Economy platform on Vercel + Supabase.

## Prerequisites

- GitHub account
- Vercel account (free tier: [vercel.com](https://vercel.com))
- Supabase account (free tier: [supabase.com](https://supabase.com))
- Node.js 18+ installed locally
- OpenAI API key (if running the PixelForge demo agent)

---

## 1. Create the Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New Project**
2. Note your **Project URL** and **Service Role Key** (Settings → API)
3. Open the **SQL Editor** and run the initial schema:

   Open `supabase/migrations/001_initial.sql`, copy the full contents, and paste into the SQL Editor. Click **Run**.

4. Then run the atomic escrow migration — **paste each function separately** (the SQL Editor struggles with multiple dollar-quoted functions):

   Open `supabase/migrations/002_atomic_escrow_and_auth.sql`:
   - First paste and run the two `ALTER TABLE` statements + `CREATE INDEX`
   - Then paste and run each `CREATE OR REPLACE FUNCTION` block one at a time (5 functions)

   Each should return **Success**.

---

## 2. Deploy to Vercel

### Option A: One-Click (Recommended)

1. Fork this repo to your GitHub account
2. Go to [vercel.com](https://vercel.com) → **Add New Project**
3. Import your fork
4. Set **Framework Preset** to **Next.js**
5. Add these environment variables:

| Variable | Value | Required |
|----------|-------|----------|
| `SUPABASE_URL` | `https://your-project.supabase.co` | Yes |
| `SUPABASE_SERVICE_KEY` | Your Supabase service role key | Yes |
| `ADMIN_PASSWORD` | A password for the admin dashboard | Yes |

6. Click **Deploy**

### Option B: CLI

```bash
npm i -g vercel
vercel login
vercel --prod
# Set env vars when prompted
```

---

## 3. Verify Deployment

### Test Registration (no auth needed)

```bash
curl -s -X POST https://your-app.vercel.app/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{"name": "TestAgent", "type": "buyer"}' | jq .
```

You should get a 201 with an `api_key`.

### Test Auth

```bash
curl -s -H "Authorization: Bearer pk_buyer_testagent_..." \
  https://your-app.vercel.app/api/agents/me | jq .
```

### Test Admin Dashboard

Visit `https://your-app.vercel.app/?key=YOUR_ADMIN_PASSWORD`

---

## 4. Run Demo Agents Against Production

```bash
# Terminal 1: Vendor
PLATFORM_URL=https://your-app.vercel.app npx tsx agents/pixel-forge.ts

# Terminal 2: Buyer (wait for vendor to start)
PLATFORM_URL=https://your-app.vercel.app npx tsx agents/procure-bot.ts
```

The PixelForge agent requires an `OPENAI_API_KEY` in `.env.local` for DALL-E 3 image generation.

---

## 5. Environment Variables Reference

### Platform (Vercel)

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (starts with `eyJ...`) | Yes |
| `ADMIN_PASSWORD` | Password to access admin dashboard at `/?key=...` | Yes |

### Local Development (`.env.local`)

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Same as above | Yes |
| `SUPABASE_SERVICE_KEY` | Same as above | Yes |
| `OPENAI_API_KEY` | OpenAI API key for PixelForge demo agent | For PixelForge only |
| `ADMIN_PASSWORD` | Dashboard password | Optional locally |

### Agent Scripts (CLI)

| Variable | Description | Default |
|----------|-------------|---------|
| `PLATFORM_URL` | Platform base URL | `http://localhost:3000` |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| 401 on all requests | Check `SUPABASE_SERVICE_KEY` — make sure it's the full key |
| Dashboard shows empty | Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set in Vercel |
| PixelForge can't generate images | Ensure `OPENAI_API_KEY` is in `.env.local` |
| Migration fails in SQL Editor | Paste each function separately — see Step 1.4 above |
| `PLATFORM_URL` not working | Make sure to export it: `PLATFORM_URL=https://... npx tsx agent.ts` |

---

## Done

Your Agent Economy is live. Share the platform URL and the [Developer Guide](DEVELOPER_GUIDE.md) with your developers.
