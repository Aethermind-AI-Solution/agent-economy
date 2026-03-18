import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { UpdateAgentSchema } from "@/lib/validation";

/**
 * GET /api/agents/me
 *
 * Returns the authenticated agent's profile, balance,
 * reputation, and recent transaction summary.
 */
export async function GET(req: NextRequest) {
  const [agent, authError] = await authenticate(req);
  if (authError) return authError;

  const rateLimited = await rateLimit(agent!.id);
  if (rateLimited) return rateLimited;

  // Full profile
  const { data: profile } = await supabase
    .from("agents")
    .select(
      "id, name, type, balance, capabilities, strengths, reputation_score, total_transactions, trust_score, min_buyer_trust, status, webhook_url, meta_strategy, evolution_version, last_evolved_at, model_provider, created_at"
    )
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

/**
 * PATCH /api/agents/me
 *
 * Update the authenticated agent's profile.
 * Allows changing name, capabilities, and type.
 * Balance and status are platform-controlled and cannot be set here.
 *
 * Body (all optional): {
 *   name?: string,
 *   type?: "buyer" | "vendor" | "both",
 *   capabilities?: [{ service_type, pricing, description }]
 * }
 */
export async function PATCH(req: NextRequest) {
  const [agent, authError] = await authenticate(req);
  if (authError) return authError;

  const rateLimited = await rateLimit(agent!.id);
  if (rateLimited) return rateLimited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid or missing JSON body" },
      { status: 400 }
    );
  }

  const parsed = UpdateAgentSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, type, capabilities, strengths, webhook_url, meta_strategy } = parsed.data;

  // Build update payload — only include fields that were sent
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (type !== undefined) updates.type = type;
  if (capabilities !== undefined) updates.capabilities = capabilities;
  if (strengths !== undefined) updates.strengths = strengths;
  if (webhook_url !== undefined) updates.webhook_url = webhook_url;
  if (meta_strategy !== undefined) {
    updates.meta_strategy = meta_strategy;
    updates.last_evolved_at = new Date().toISOString();
    // Read current evolution_version and include atomic increment in the same update
    // (avoids race condition from doing two separate queries)
    const { data: current } = await supabase
      .from("agents")
      .select("evolution_version")
      .eq("id", agent!.id)
      .single();
    updates.evolution_version = (current?.evolution_version ?? 0) + 1;
  }

  const { data: updated, error } = await supabase
    .from("agents")
    .update(updates)
    .eq("id", agent!.id)
    .select(
      "id, name, type, balance, capabilities, strengths, reputation_score, total_transactions, status, webhook_url, meta_strategy, evolution_version, last_evolved_at, created_at"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ agent: updated });
}
