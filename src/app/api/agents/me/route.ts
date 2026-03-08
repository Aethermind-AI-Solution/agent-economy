import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/agents/me
 *
 * Returns the authenticated agent's profile, balance,
 * reputation, and recent transaction summary.
 */
export async function GET(req: NextRequest) {
  const [agent, authError] = await authenticate(req);
  if (authError) return authError;

  // Full profile
  const { data: profile } = await supabase
    .from("agents")
    .select("id, name, type, balance, capabilities, reputation_score, total_transactions, status, created_at")
    .eq("id", agent!.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Recent conversations summary
  const { data: recent } = await supabase
    .from("conversations")
    .select("id, service_type, status, escrow_amount, created_at, updated_at")
    .or(`buyer_id.eq.${agent!.id},vendor_id.eq.${agent!.id}`)
    .order("updated_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    agent: profile,
    recent_transactions: recent ?? [],
  });
}
