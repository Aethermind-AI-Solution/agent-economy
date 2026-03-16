/**
 * DataAgent — Lead Generation Crew, Step 2
 *
 * Enriches and scores the raw company list from ResearchAgent.
 * Returns top 20 companies scored 1-10 on AI automation readiness.
 *
 * Run standalone: npx tsx agents/data-agent.ts companies.json
 * Or via crew:    npx tsx agents/run-crew.ts "..."
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { AgentSDK, type Episode } from "../src/lib/sdk";
import type { Company } from "./research-agent";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });

const AGENT_NAME = "DataAgent";

function ts() {
  return new Date().toTimeString().slice(0, 8);
}
function log(msg: string) {
  console.log(`[${AGENT_NAME} ${ts()}] ${msg}`);
}

function parseJsonFromClaude(text: string): any {
  const cleaned = text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  return JSON.parse(cleaned);
}

function formatEpisodesForPrompt(episodes: Episode[]): string {
  if (episodes.length === 0) return "";
  const lines = episodes.map((ep, i) => {
    const when = new Date(ep.created_at).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    });
    return `Episode ${i + 1} [${when}] — ${ep.outcome.toUpperCase()}\n  ${ep.task_summary}`;
  });
  return ["\n\n---", "PAST EXPERIENCE (use to improve this response):", ...lines, "---"].join("\n");
}

export interface ScoredLead {
  company_name: string;
  industry: string;
  score: number;
  company_size: string;
  decision_maker: string;
  contact_info: string;
  pain_points: string[];
  recommended_solution: string;
}

export async function registerDataAgent(
  platformUrl: string
): Promise<{ sdk: AgentSDK; agentId: string }> {
  const existingKey = process.env.DATA_AGENT_KEY;
  if (existingKey) {
    log("Using existing registration");
    const sdk = new AgentSDK(platformUrl, existingKey);
    const profile = await sdk.getProfile();
    log(`Profile loaded: ${profile.agent.id} (balance: $${profile.agent.balance.toFixed(2)})`);
    return { sdk, agentId: profile.agent.id };
  }

  log("Registering on platform...");
  const res = await fetch(`${platformUrl}/api/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: AGENT_NAME,
      type: "both",
      capabilities: [
        {
          service_type: "lead_enrichment",
          pricing: { model: "per_job", unit_price: 1.0, currency: "USD" },
          description:
            "Enriches company data and scores AI automation readiness (1-10). Returns top 20 leads.",
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Registration failed: ${JSON.stringify(err)}`);
  }

  const { agent, api_key } = await res.json();
  log(`Registered: ${agent.id} (balance: $${agent.balance.toFixed(2)})`);

  const envPath = path.resolve(__dirname, "../.env.local");
  fs.appendFileSync(envPath, `\nDATA_AGENT_KEY=${api_key}\n`);
  process.env.DATA_AGENT_KEY = api_key;
  log("API key saved to .env.local — ensure .env.local is in .gitignore");

  return { sdk: new AgentSDK(platformUrl, api_key), agentId: agent.id };
}

export async function enrichAndScore(
  companies: Company[],
  anthropic: Anthropic,
  sdk?: AgentSDK
): Promise<ScoredLead[]> {
  log(`Enriching and scoring ${companies.length} companies...`);

  let episodeContext = "";
  if (sdk) {
    try {
      const episodes = await sdk.getMyEpisodes("lead_enrichment", 3);
      episodeContext = formatEpisodesForPrompt(episodes);
      if (episodes.length > 0) log(`Loaded ${episodes.length} past episode(s) for context`);
    } catch (err: any) {
      log(`Warning: Could not fetch episodes (${err.message}) — continuing without context`);
    }
  }

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    system: `You are a business intelligence analyst specializing in AI automation readiness assessment for Indian companies.
You have deep knowledge of Indian business sectors, typical company sizes, decision-maker roles, and digital transformation maturity.
Always respond with valid JSON only — no markdown, no explanations, no preamble.${episodeContext}`,
    messages: [
      {
        role: "user",
        content: `Enrich and score these ${companies.length} Indian companies for AI automation readiness.

Companies to analyze:
${JSON.stringify(companies, null, 2)}

Score each company 1-10 on AI automation readiness:
- High (8-10): large manual workforce, explicit stated need, budget capacity, clear ROI potential
- Medium (5-7): some manual processes, moderate need or uncertainty about budget
- Low (1-4): already using AI/automation, too small, no clear pain point

Return the TOP 20 companies sorted by score descending as a JSON array.
Each element must have exactly these fields:
- company_name: string
- industry: string
- score: number (1-10, integer)
- company_size: string (e.g. "500-1000 employees", "SMB ~200 staff", "Enterprise 5000+")
- decision_maker: string (likely title, e.g. "CTO / VP Engineering" or specific name if well-known)
- contact_info: string (LinkedIn company URL, or "linkedin.com/company/name", or "Not publicly available")
- pain_points: string[] (2-4 specific pain points based on their industry and the original why_they_need_ai)
- recommended_solution: string (specific AI automation solution Aethermind could provide)

Return ONLY the JSON array, nothing else.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const leads: ScoredLead[] = parseJsonFromClaude(text);
    log(`Top ${leads.length} leads scored and ranked`);
    return leads;
  } catch (err: any) {
    log(`Failed to parse Claude response: ${err.message}`);
    log(`Raw response (first 200 chars): ${text.slice(0, 200)}`);
    throw new Error("Claude returned invalid JSON for scored leads");
  }
}

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(`Usage: npx tsx agents/data-agent.ts <companies.json>`);
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("FATAL: ANTHROPIC_API_KEY not set in .env.local");
    process.exit(1);
  }

  const companies: Company[] = JSON.parse(fs.readFileSync(inputFile, "utf-8"));
  const platformUrl = process.env.PLATFORM_URL ?? "http://localhost:3000";
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  await registerDataAgent(platformUrl);
  const leads = await enrichAndScore(companies, anthropic, undefined);
  console.log(JSON.stringify(leads, null, 2));
}

if (process.argv[1] === __filename) {
  main().catch((err) => {
    log(`FATAL: ${err.message}`);
    process.exit(1);
  });
}
