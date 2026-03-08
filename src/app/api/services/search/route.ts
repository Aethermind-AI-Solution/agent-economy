import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/services/search?type=image_generation
 *
 * Discovery endpoint. Buyer agents use this to find vendors
 * that offer a specific service type.
 *
 * Query params:
 *   type (required) — service type to search for
 *
 * Returns: list of matching agents with their capabilities and reputation.
 */
export async function GET(req: NextRequest) {
  const [agent, authError] = await authenticate(req);
  if (authError) return authError;

  const serviceType = req.nextUrl.searchParams.get("type");
  if (!serviceType) {
    return NextResponse.json(
      { error: "Missing required query param: type" },
      { status: 400 }
    );
  }

  // Search agents whose capabilities JSONB array contains
  // an object with matching service_type.
  // Postgres GIN index on capabilities makes this fast.
  const { data: vendors, error } = await supabase
    .from("agents")
    .select("id, name, capabilities, reputation_score, total_transactions")
    .eq("status", "active")
    .in("type", ["vendor", "both"])
    .filter("capabilities", "cs", JSON.stringify([{ service_type: serviceType }]));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Shape response: extract only the matching capability per vendor
  const results = (vendors ?? []).map((v) => {
    const capability = (v.capabilities as any[]).find(
      (c: any) => c.service_type === serviceType
    );
    return {
      agent_id: v.id,
      agent_name: v.name,
      service: capability,
      reputation: {
        score: v.reputation_score,
        transactions: v.total_transactions,
      },
    };
  });

  return NextResponse.json({
    service_type: serviceType,
    results,
    count: results.length,
  });
}
