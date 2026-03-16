import { supabase } from "./supabase";

/**
 * Returns a color string for a given trust score.
 * >= 7 → green, >= 4 → amber, < 4 → red
 */
export function trustColor(score: number): string {
  if (score >= 7) return "#059669";
  if (score >= 4) return "#ca8a04";
  return "#dc2626";
}

/**
 * Recomputes the trust score for an agent by calling the Postgres RPC.
 * Fire-and-forget safe — never throws.
 */
export async function recomputeTrust(agentId: string): Promise<void> {
  await supabase.rpc("compute_trust_score", { p_agent_id: agentId });
}
