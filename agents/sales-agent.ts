/**
 * SalesAgent — Lead Generation Crew, Step 3
 *
 * Drafts personalized outreach messages (email + LinkedIn) for the top 10 leads.
 * Uses Claude API to write professional, consultative messages referencing
 * each company's specific pain points and how Aethermind can help.
 *
 * Run standalone: npx tsx agents/sales-agent.ts scored-leads.json
 * Or via crew:    npx tsx agents/run-crew.ts "..."
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { AgentSDK, type Episode } from "../src/lib/sdk";
import type { ScoredLead } from "./data-agent";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });

const AGENT_NAME = "SalesAgent";

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

export interface OutreachDraft {
  company_name: string;
  decision_maker: string;
  subject_line: string;
  email_body: string;
  linkedin_message: string;
  score: number;
}

export async function registerSalesAgent(
  platformUrl: string
): Promise<{ sdk: AgentSDK; agentId: string }> {
  const existingKey = process.env.SALES_AGENT_KEY;
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
      type: "vendor",
      capabilities: [
        {
          service_type: "outreach_drafting",
          pricing: { model: "per_job", unit_price: 1.0, currency: "USD" },
          description:
            "Drafts personalized sales outreach emails and LinkedIn messages for B2B leads.",
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
  fs.appendFileSync(envPath, `\nSALES_AGENT_KEY=${api_key}\n`);
  process.env.SALES_AGENT_KEY = api_key;
  log("API key saved to .env.local — ensure .env.local is in .gitignore");

  return { sdk: new AgentSDK(platformUrl, api_key), agentId: agent.id };
}

export async function draftOutreach(
  scoredLeads: ScoredLead[],
  anthropic: Anthropic,
  sdk?: AgentSDK,
  metaStrategy?: string
): Promise<OutreachDraft[]> {
  const top10 = scoredLeads.slice(0, 10);
  log(`Drafting outreach for top ${top10.length} leads...`);

  let episodeContext = "";
  if (sdk) {
    try {
      const episodes = await sdk.getMyEpisodes("outreach_drafting", 3);
      episodeContext = formatEpisodesForPrompt(episodes);
      if (episodes.length > 0) log(`Loaded ${episodes.length} past episode(s) for context`);
    } catch (err: any) {
      log(`Warning: Could not fetch episodes (${err.message}) — continuing without context`);
    }
  }

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    system: `You are a consultative sales expert for Aethermind AI Solutions, an AI automation agency based in India.
Aethermind helps businesses automate manual processes, reduce operational costs, and scale using custom AI solutions.
Services include: intelligent document processing, workflow automation, AI-powered data pipelines,
custom ML models, and conversational AI for customer service.
Your outreach messages are professional, specific to each company, and genuinely helpful — never generic or pushy.
Always respond with valid JSON only — no markdown, no explanations, no preamble.${episodeContext}${metaStrategy ?? ""}`,
    messages: [
      {
        role: "user",
        content: `Draft personalized outreach messages for these ${top10.length} high-priority leads.

Leads:
${JSON.stringify(top10, null, 2)}

For each lead, create:
1. A subject line (max 10 words) that references their specific situation or pain point
2. An email body (150-200 words) that:
   - Opens by naming their specific pain point (from pain_points)
   - Explains how AI automation directly solves it with 1-2 concrete outcomes (time saved, cost reduced, error rate)
   - Briefly mentions Aethermind's relevant capability (from recommended_solution)
   - Ends with a soft CTA: "Would a 15-minute discovery call make sense?"
   - Signs off as: "The Aethermind AI Solutions Team | aethermind.ai"
3. A LinkedIn message (50-75 words, conversational, first-person)

Return a JSON array where each element has exactly these fields:
- company_name: string
- decision_maker: string (from the input data)
- subject_line: string
- email_body: string
- linkedin_message: string
- score: number (from the input data)

Return ONLY the JSON array, nothing else.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const drafts: OutreachDraft[] = parseJsonFromClaude(text);
    log(`Drafted ${drafts.length} outreach messages`);
    return drafts;
  } catch (err: any) {
    log(`Failed to parse Claude response: ${err.message}`);
    log(`Raw response (first 200 chars): ${text.slice(0, 200)}`);
    throw new Error("Claude returned invalid JSON for outreach drafts");
  }
}

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(`Usage: npx tsx agents/sales-agent.ts <scored-leads.json>`);
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("FATAL: ANTHROPIC_API_KEY not set in .env.local");
    process.exit(1);
  }

  const leads: ScoredLead[] = JSON.parse(fs.readFileSync(inputFile, "utf-8"));
  const platformUrl = process.env.PLATFORM_URL ?? "http://localhost:3000";
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  await registerSalesAgent(platformUrl);
  const drafts = await draftOutreach(leads, anthropic, undefined);
  console.log(JSON.stringify(drafts, null, 2));
}

if (process.argv[1] === __filename) {
  main().catch((err) => {
    log(`FATAL: ${err.message}`);
    process.exit(1);
  });
}
