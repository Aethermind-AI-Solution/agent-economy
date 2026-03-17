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
import { createThread, startThread, completeThread, failThread } from "../src/lib/threads";
import { webSearch, formatSearchResults } from "../src/lib/web-search";
import { makeLogger, parseJsonFromClaude, formatEpisodesForPrompt } from "./utils";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });

const AGENT_NAME = "ResearchAgent";
const log = makeLogger(AGENT_NAME);

async function decompose(query: string, anthropic: Anthropic): Promise<string[]> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: "You are a research query decomposer. Split a broad research query into exactly 5 focused, non-overlapping sub-queries that together cover the full scope. Respond with a JSON array of 5 strings only — no markdown, no explanation.",
      messages: [
        {
          role: "user",
          content: `Split this into exactly 5 focused sub-queries: "${query}"\n\nReturn ONLY a JSON array of 5 strings.`,
        },
      ],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const subQueries: string[] = parseJsonFromClaude(text);
    if (!Array.isArray(subQueries) || subQueries.length !== 5) {
      return [query];
    }
    return subQueries;
  } catch (err: any) {
    log(`decompose() failed: ${err.message} — falling back to single query`);
    return [query];
  }
}

async function findSubQuery(subQuery: string, anthropic: Anthropic, metaStrategy?: string): Promise<Company[]> {
  const searchResults = await webSearch(subQuery, 5);
  const hasResults = searchResults.length > 0;
  if (hasResults) {
    log(`Sub-query web search: ${searchResults.length} results fetched`);
  }

  const userContent = hasResults
    ? `Here are live web search results for: "${subQuery}"

${formatSearchResults(searchResults)}

Based on these search results AND your knowledge of Indian businesses, find 8-12 companies matching: "${subQuery}"

Prioritize companies mentioned in the search results above.
Focus on companies with clear automation opportunities: manual data entry, large workforces doing
repetitive tasks, outdated processes, or stated interest in digital transformation.

Return a JSON array where each element has exactly these fields:
- company_name: string (real Indian company name)
- industry: string (specific industry sector)
- website: string (website URL from search results or likely URL)
- why_they_need_ai: string (specific pain point or manual process this company faces)
- source: string (e.g. "web search", "industry knowledge", "sector research")

Return ONLY the JSON array, nothing else.`
    : `Find 8-12 Indian companies matching this criteria: "${subQuery}"

For each company, provide realistic details based on your knowledge of Indian businesses.
Focus on companies with clear automation opportunities: manual data entry, large workforces doing
repetitive tasks, outdated processes, or stated interest in digital transformation.

Return a JSON array where each element has exactly these fields:
- company_name: string (real or realistic Indian company name)
- industry: string (specific industry sector)
- website: string (likely website URL, e.g. "https://company.com")
- why_they_need_ai: string (specific pain point or manual process this company faces)
- source: string (e.g. "industry knowledge", "sector research", "public reports")

Return ONLY the JSON array, nothing else.`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    system: `You are a market research specialist with deep knowledge of the Indian business landscape.
You identify real companies that would benefit from AI automation solutions.
Always respond with valid JSON only — no markdown, no explanations, no preamble.${metaStrategy ?? ""}`,
    messages: [{ role: "user", content: userContent }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  try {
    const companies: Company[] = parseJsonFromClaude(text);
    return companies;
  } catch {
    return [];
  }
}

export async function findCompaniesParallel(
  query: string,
  anthropic: Anthropic,
  sdk?: AgentSDK,
  agentId?: string,
  metaStrategy?: string
): Promise<Company[]> {
  if (!process.env.TAVILY_API_KEY) {
    log("WARNING: TAVILY_API_KEY not set — using Claude knowledge only (no live web search)");
  }
  log(`Decomposing query into 5 parallel sub-queries...`);
  const subQueries = await decompose(query, anthropic);

  if (subQueries.length === 1) {
    log("Decomposition failed — running single sub-query fallback");
    return findSubQuery(query, anthropic, metaStrategy);
  }

  log(`Running ${subQueries.length} sub-queries in parallel...`);
  const results = await Promise.all(
    subQueries.map(async (subQuery, i) => {
      let threadId = "";
      if (agentId) {
        try {
          threadId = await createThread(agentId, "research_subtask", { subQuery, index: i });
          if (threadId) await startThread(threadId);
        } catch {}
      }
      try {
        log(`Sub-query ${i + 1}/5: "${subQuery.slice(0, 60)}"`);
        const companies = await findSubQuery(subQuery, anthropic, metaStrategy);
        log(`Sub-query ${i + 1}/5 done: ${companies.length} companies`);
        if (threadId) completeThread(threadId, { count: companies.length }).catch(() => {});
        return companies;
      } catch (err: any) {
        log(`Sub-query ${i + 1}/5 failed: ${err.message}`);
        if (threadId) failThread(threadId, err.message).catch(() => {});
        return [] as Company[];
      }
    })
  );

  // Merge + deduplicate by normalised company_name
  const seen = new Set<string>();
  const deduped = results.flat().filter((c) => {
    const key = c.company_name.toLowerCase().replace(/\s+/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  log(`Merged ${results.flat().length} → ${deduped.length} unique companies`);
  return deduped.slice(0, 50);
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
      agent_role: "orchestrator",
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
  log("API key saved to .env.local — ensure .env.local is in .gitignore");

  return { sdk: new AgentSDK(platformUrl, api_key), agentId: agent.id };
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

  if (!process.env.TAVILY_API_KEY) {
    console.warn(
      "WARNING: TAVILY_API_KEY not set. Web search is disabled — " +
      "company data will be synthesized from Claude's training knowledge only. " +
      "Add TAVILY_API_KEY to .env.local for live web search results."
    );
  }

  const platformUrl = process.env.PLATFORM_URL ?? "http://localhost:3000";
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const { agentId } = await registerResearchAgent(platformUrl);
  const companies = await findCompaniesParallel(query, anthropic, undefined, agentId);
  console.log(JSON.stringify(companies, null, 2));
}

if (process.argv[1] === __filename) {
  main().catch((err) => {
    log(`FATAL: ${err.message}`);
    process.exit(1);
  });
}
