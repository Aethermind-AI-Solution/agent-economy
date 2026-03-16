import { supabase } from "./supabase";

export interface Episode {
  id: string;
  agent_id: string;
  conversation_id: string;
  task_type: string;
  role: "buyer" | "vendor";
  outcome: "success" | "failure";
  task_summary: string;
  artifacts_summary: Record<string, unknown> | null;
  escrow_amount: number | null;
  created_at: string;
}

function buildTaskSummary(conv: any, outcome: "success" | "failure"): string {
  const { service_type, rfq_payload: rfq, offer_payload: offer, delivery_payload: del } = conv;
  if (outcome === "failure") {
    return `'${service_type}' task DISPUTED. ${del ? "Partial delivery received." : "No delivery made."}`;
  }
  try {
    if (service_type === "lead_enrichment") {
      const data = del?.artifacts?.[0]?.data ?? [];
      const top = data[0];
      return [
        `Enriched company list from query: "${rfq?.query ?? "unknown"}".`,
        `Returned ${data.length} scored leads.`,
        top ? `Top lead: ${top.company_name} (score ${top.score}/10, ${top.industry}).` : "",
      ].filter(Boolean).join(" ");
    }
    if (service_type === "outreach_drafting") {
      const data = del?.artifacts?.[0]?.data ?? [];
      const top = data[0];
      return [
        `Drafted outreach for ${data.length} leads.`,
        top ? `Top: ${top.company_name} (${top.decision_maker}, score ${top.score}/10). Subject: "${top.subject_line}".` : "",
      ].filter(Boolean).join(" ");
    }
    if (service_type === "image_generation") {
      const count = del?.artifacts?.length ?? 0;
      const prompt = rfq?.description ?? rfq?.prompt ?? "unknown";
      return `Generated ${count} image(s) for: "${String(prompt).slice(0, 80)}".`;
    }
    return `Completed '${service_type}' task for $${offer?.price ?? conv.escrow_amount ?? "?"}.`;
  } catch {
    return `Completed '${service_type}' task.`;
  }
}

function buildArtifactsSummary(conv: any): Record<string, unknown> | null {
  const del = conv.delivery_payload as any;
  if (!del) return null;
  try {
    if (conv.service_type === "lead_enrichment") {
      const data = del?.artifacts?.[0]?.data ?? [];
      return {
        type: "scored_leads",
        total_count: data.length,
        top3: data.slice(0, 3).map((l: any) => ({
          company_name: l.company_name,
          score: l.score,
          industry: l.industry,
        })),
      };
    }
    if (conv.service_type === "outreach_drafting") {
      const data = del?.artifacts?.[0]?.data ?? [];
      return {
        type: "outreach_drafts",
        total_count: data.length,
        top3: data.slice(0, 3).map((d: any) => ({
          company_name: d.company_name,
          subject_line: d.subject_line,
          score: d.score,
        })),
      };
    }
    return del;
  } catch {
    return null;
  }
}

/**
 * Record two episode rows (buyer + vendor) for a completed or disputed conversation.
 * Never throws — fire-and-forget safe.
 */
export async function recordEpisode(conv: any): Promise<void> {
  const outcome: "success" | "failure" = conv.status === "completed" ? "success" : "failure";
  const summary = buildTaskSummary(conv, outcome);
  const artifacts = outcome === "success" ? buildArtifactsSummary(conv) : null;

  const rows = (["buyer", "vendor"] as const).map((role) => ({
    agent_id: role === "buyer" ? conv.buyer_id : conv.vendor_id,
    conversation_id: conv.id,
    task_type: conv.service_type,
    role,
    outcome,
    task_summary: summary,
    artifacts_summary: artifacts,
    escrow_amount: conv.escrow_amount,
  }));

  const { error } = await supabase.from("agent_episodes").insert(rows);
  if (error) {
    console.error(
      JSON.stringify({ event: "record_episode_error", conversation_id: conv.id, error: error.message })
    );
  }
}

/**
 * Fetch the N most recent episodes for an agent + task type.
 * Returns [] on error (never throws).
 */
export async function getRelevantEpisodes(
  agentId: string,
  taskType: string,
  limit = 3
): Promise<Episode[]> {
  const { data, error } = await supabase
    .from("agent_episodes")
    .select("*")
    .eq("agent_id", agentId)
    .eq("task_type", taskType)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error(
      JSON.stringify({ event: "get_episodes_error", agent_id: agentId, error: error.message })
    );
    return [];
  }
  return (data ?? []) as Episode[];
}
