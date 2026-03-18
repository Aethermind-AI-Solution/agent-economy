/**
 * Self-Evolving Agents
 *
 * After enough completed runs, an agent reads its own episode history
 * and uses Claude to synthesize a meta_strategy — learned heuristics,
 * patterns to avoid, prompt additions — that improves future runs.
 *
 * The evolved strategy is stored back on the agents row and injected
 * into Claude system prompts at runtime.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { supabase } from "./supabase";

const MetaStrategyResponseSchema = z.object({
  learned_heuristics: z.array(z.string()).default([]),
  avoid_patterns: z.array(z.string()).default([]),
  prompt_additions: z.string().default(""),
});

const EVOLUTION_THRESHOLD = 3; // episodes since last evolution to trigger

export interface MetaStrategy {
  learned_heuristics: string[];
  avoid_patterns: string[];
  prompt_additions: string;
  version: number;
  evolved_at: string;
}

/**
 * Returns true if the agent has enough new episodes since its last evolution
 * to warrant running the evolution process.
 */
export async function shouldEvolve(agentId: string): Promise<boolean> {
  const { data: agent } = await supabase
    .from("agents")
    .select("last_evolved_at, evolution_version")
    .eq("id", agentId)
    .single();

  if (!agent) return false;

  const since = agent.last_evolved_at
    ? new Date(agent.last_evolved_at).toISOString()
    : new Date(0).toISOString();

  const { count } = await supabase
    .from("agent_episodes")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .gt("created_at", since);

  return (count ?? 0) >= EVOLUTION_THRESHOLD;
}

/**
 * Runs the evolution process for an agent:
 * 1. Fetches last 10 episodes
 * 2. Calls Claude to synthesize a meta_strategy
 * 3. Writes meta_strategy back to the agents row (increments evolution_version)
 *
 * Fire-and-forget safe — never throws.
 */
export async function evolveAgent(agentId: string): Promise<MetaStrategy | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    // Fetch agent info + recent episodes
    const [{ data: agent }, { data: episodes }] = await Promise.all([
      supabase.from("agents").select("name, evolution_version, meta_strategy").eq("id", agentId).single(),
      supabase.from("agent_episodes")
        .select("task_type, role, outcome, task_summary, artifacts_summary, escrow_amount, created_at")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (!agent || !episodes || episodes.length === 0) return null;

    const currentVersion = agent.evolution_version ?? 0;
    const currentStrategy = agent.meta_strategy as MetaStrategy | null;

    const anthropic = new Anthropic({ apiKey });

    const episodeSummary = episodes.map((e, i) =>
      `Episode ${i + 1}: task=${e.task_type} role=${e.role} outcome=${e.outcome}\nSummary: ${e.task_summary}`
    ).join("\n\n");

    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      system: `You are analyzing the performance history of an AI agent called "${agent.name}" to help it improve.
Your job is to extract actionable learnings from its episode history and produce a concise meta_strategy JSON.
The meta_strategy will be injected into the agent's system prompt on future runs.
Be specific, concrete, and brief. Focus on what actually changed outcomes.`,
      messages: [{
        role: "user",
        content: `Here are the agent's recent episodes:\n\n${episodeSummary}\n\n${
          currentStrategy ? `Current strategy (version ${currentVersion}):\n${JSON.stringify(currentStrategy, null, 2)}\n\n` : ""
        }Output a JSON object with exactly these fields:
{
  "learned_heuristics": ["up to 5 specific, actionable patterns that improved outcomes"],
  "avoid_patterns": ["up to 3 things that consistently led to poor outcomes"],
  "prompt_additions": "1-2 sentences to append to the system prompt to improve future runs"
}
Only output the JSON object, nothing else.`,
      }],
    });

    const rawText = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    const cleaned = rawText.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    const parsed = MetaStrategyResponseSchema.parse(JSON.parse(cleaned));

    const evolvedAt = new Date().toISOString();

    // Build strategy without version — version comes from the DB after atomic increment
    const strategyPayload = {
      learned_heuristics: parsed.learned_heuristics,
      avoid_patterns: parsed.avoid_patterns,
      prompt_additions: parsed.prompt_additions,
      evolved_at: evolvedAt,
    };

    // Write back to platform — DB increments evolution_version atomically
    const { data: rpcResult } = await supabase.rpc("increment_evolution_version", {
      p_agent_id: agentId,
      p_meta_strategy: strategyPayload,
      p_evolved_at: evolvedAt,
    });

    const newVersion: number = rpcResult ?? currentVersion + 1;
    const newStrategy: MetaStrategy = { ...strategyPayload, version: newVersion };

    console.log(JSON.stringify({
      event: "agent_evolved",
      agent_id: agentId,
      agent_name: agent.name,
      version: newVersion,
      heuristics_count: newStrategy.learned_heuristics.length,
    }));

    return newStrategy;
  } catch (err: any) {
    console.error(JSON.stringify({ event: "evolution_failed", agent_id: agentId, error: err?.message }));
    return null;
  }
}

/**
 * Reads the current meta_strategy for an agent.
 * Returns null if agent hasn't evolved yet.
 */
export async function getMetaStrategy(agentId: string): Promise<MetaStrategy | null> {
  const { data } = await supabase
    .from("agents")
    .select("meta_strategy")
    .eq("id", agentId)
    .single();
  return (data?.meta_strategy as MetaStrategy) ?? null;
}

/**
 * Formats a meta_strategy into a string to append to a Claude system prompt.
 */
export function formatMetaStrategy(strategy: MetaStrategy | null): string {
  if (!strategy) return "";
  const parts: string[] = [];
  if (strategy.learned_heuristics.length > 0) {
    parts.push(`Learned heuristics from past runs:\n${strategy.learned_heuristics.map(h => `- ${h}`).join("\n")}`);
  }
  if (strategy.avoid_patterns.length > 0) {
    parts.push(`Patterns to avoid:\n${strategy.avoid_patterns.map(p => `- ${p}`).join("\n")}`);
  }
  if (strategy.prompt_additions) {
    parts.push(strategy.prompt_additions);
  }
  return parts.length > 0 ? `\n\n[Evolved Strategy v${strategy.version}]\n${parts.join("\n\n")}` : "";
}
