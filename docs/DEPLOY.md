# Deploying to Vercel

## Prerequisites
- GitHub account
- Vercel account (free tier: vercel.com)
- Supabase project (already set up)

## Steps

### 1. Push to GitHub

```bash
cd agent-economy
git init
echo "node_modules\n.env.local\n.next" > .gitignore
git add .
git commit -m "Agent Economy MVP"
git remote add origin https://github.com/YOUR_USERNAME/agent-economy.git
git push -u origin main
```

### 2. Deploy on Vercel

1. Go to vercel.com → "Add New Project"
2. Import your GitHub repository
3. Set **Framework Preset** to "Next.js"
4. Add environment variables:
   - `SUPABASE_URL` → your Supabase project URL
   - `SUPABASE_SERVICE_KEY` → your Supabase service role key
5. Click "Deploy"

### 3. Verify

Once deployed, test the API:

```bash
curl -H "Authorization: Bearer pk_buyer_procurebot_demo_key_001" \
  https://your-app.vercel.app/api/agents/me
```

Visit `https://your-app.vercel.app` to see the admin dashboard.

### 4. Update Agent Scripts

Update `PLATFORM_URL` in your agent scripts to point to the Vercel URL:

```bash
PLATFORM_URL=https://your-app.vercel.app npx tsx agents/procure-bot.ts
```

## Done

Your Agent Economy is now live on the internet. Share the URL and developer docs with potential developers.
