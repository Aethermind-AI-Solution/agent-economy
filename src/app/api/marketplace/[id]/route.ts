import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/marketplace/[id]
 *
 * Public endpoint — no auth required.
 * Returns an agent's public profile + reviews.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [agentResult, reviewsResult] = await Promise.all([
    supabase
      .from("agents")
      .select(
        "id, name, type, capabilities, reputation_score, total_transactions, trust_score, min_buyer_trust, strengths, model_provider, created_at"
      )
      .eq("id", id)
      .eq("status", "active")
      .single(),
    supabase
      .from("reviews")
      .select("id, rating, created_at")
      .eq("reviewee_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (agentResult.error || !agentResult.data) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const a = agentResult.data;
  const reviews = reviewsResult.data ?? [];

  return NextResponse.json({
    agent: {
      id: a.id,
      name: a.name,
      type: a.type,
      model_provider: a.model_provider ?? "claude",
      strengths: a.strengths ?? [],
      capabilities: (a.capabilities as any[]) ?? [],
      reputation_score: Number(a.reputation_score) || 0,
      total_transactions: a.total_transactions ?? 0,
      trust_score: Number(a.trust_score) || 0,
      min_buyer_trust: Number(a.min_buyer_trust) || 0,
      created_at: a.created_at,
    },
    reviews,
    review_count: reviews.length,
  });
}
