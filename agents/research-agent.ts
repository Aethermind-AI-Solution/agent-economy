/**
 * ResearchAgent — Lead Generation Crew, Step 1
 *
 * Finds 30-50 Indian companies that need AI automation.
 * Uses Claude API to synthesize company data from knowledge.
 *
 * Run standalone: npx tsx agents/research-agent.ts "healthcare companies in India"
 * Or via crew:    npx tsx agents/run-crew.ts "..."
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { AgentSDK } from "../src/lib/sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const AGENT_NAME = "ResearchAgent";

function ts() {
  return new Date().toTimeString().slice(0, 8);
}
function log(msg: string) {
  console.log(`[${AGENT_NAME} ${ts()}] ${msg}`);
}

function parseJsonFromClaude(text: string): any {
  // Strip markdown code fences if Claude wraps the response
  const cleaned = text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  return JSON.parse(cleaned);
}

export interface Company {
  company_name: string;
  industry: string;
  website: string;
  why_they_need_ai: string;
  source: string;
}

export async function registerResearchAgent(
  platformUrl: string
): Promise<{ sdk: AgentSDK; agentId: string }> {
  const existingKey = process.env.RESEARCH_AGENT_KEY;
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
      type: "buyer",
      capabilities: [],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Registration failed: ${JSON.stringify(err)}`);
  }

  const { agent, api_key } = await res.json();
  log(`Registered: ${agent.id} (balance: $${agent.balance.toFixed(2)})`);

  const envPath = path.resolve(__dirname, "../.env.local");
  fs.appendFileSync(envPath, `\nRESEARCH_AGENT_KEY=${api_key}\n`);
  process.env.RESEARCH_AGENT_KEY = api_key;
  log("API key saved to .env.local");

  return { sdk: new AgentSDK(platformUrl, api_key), agentId: agent.id };
}

export async function findCompanies(
  query: string,
  anthropic: Anthropic
): Promise<Company[]> {
  log(`Researching: "${query}"`);

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    system: `You are a market research specialist with deep knowledge of the Indian business landscape.
You identify real companies that would benefit from AI automation solutions.
Always respond with valid JSON only — no markdown, no explanations, no preamble.`,
    messages: [
      {
        role: "user",
        content: `Find 30-50 Indian companies matching this criteria: "${query}"

For each company, provide realistic details based on your knowledge of Indian businesses.
Focus on companies with clear automation opportunities: manual data entry, large workforces doing
repetitive tasks, outdated processes, or stated interest in digital transformation.

Return a JSON array where each element has exactly these fields:
- company_name: string (real or realistic Indian company name)
- industry: string (specific industry sector)
- website: string (likely website URL, e.g. "https://company.com")
- why_they_need_ai: string (specific pain point or manual process this company faces)
- source: string (e.g. "industry knowledge", "sector research", "public reports")

Return ONLY the JSON array, nothing else.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const companies: Company[] = parseJsonFromClaude(text);
    log(`Found ${companies.length} companies`);
    return companies;
  } catch (err: any) {
    log(`Failed to parse Claude response: ${err.message}`);
    log(`Raw response (first 200 chars): ${text.slice(0, 200)}`);
    throw new Error("Claude returned invalid JSON for company list");
  }
}

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error(`Usage: npx tsx agents/research-agent.ts "<search query>"`);
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("FATAL: ANTHROPIC_API_KEY not set in .env.local");
    process.exit(1);
  }

  const platformUrl = process.env.PLATFORM_URL ?? "http://localhost:3000";
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  await registerResearchAgent(platformUrl);
  const companies = await findCompanies(query, anthropic);
  console.log(JSON.stringify(companies, null, 2));
}

if (process.argv[1] === __filename) {
  main().catch((err) => {
    log(`FATAL: ${err.message}`);
    process.exit(1);
  });
}
