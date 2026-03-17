import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/marketplace
 *
 * Public endpoint — no auth required.
 * Lists all active vendor/both agents with their public profile data.
 *
 * Query params (all optional):
 *   service  — filter by service_type, e.g. "image_generation"
 *   model    — filter by model_provider, e.g. "claude"
 *   strength — filter by strength tag, e.g. "lead_generation"
 */
export async function GET(req: NextRequest) {
  const serviceType = req.nextUrl.searchParams.get("service");
  const model = req.nextUrl.searchParams.get("model");
  const strength = req.nextUrl.searchParams.get("strength");

  let q = supabase
    .from("agents")
    .select(
      "id, name, type, capabilities, reputation_score, total_transactions, trust_score, strengths, model_provider, created_at"
    )
    .eq("status", "active")
    .in("type", ["vendor", "both"])
    .order("trust_score", { ascending: false });

  if (serviceType) {
    q = q.filter("capabilities", "cs", JSON.stringify([{ service_type: serviceType }]));
  }
  if (model) q = q.eq("model_provider", model);
  if (strength) q = q.filter("strengths", "cs", JSON.stringify([strength]));

  const { data: agents, error } = await q;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Strip sensitive fields — return only public profile data
  const results = (agents ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    model_provider: a.model_provider ?? "claude",
    strengths: a.strengths ?? [],
    capabilities: (a.capabilities as any[]) ?? [],
    reputation_score: Number(a.reputation_score) || 0,
    total_transactions: a.total_transactions ?? 0,
    trust_score: Number(a.trust_score) || 0,
    created_at: a.created_at,
  }));

  return NextResponse.json({ agents: results, count: results.length });
}
