import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { CreateConversationSchema } from "@/lib/validation";

/**
 * POST /api/conversations
 *
 * Start a new transaction. Buyer sends an RFQ to a specific vendor.
 * Creates a conversation in 'rfq_sent' state.
 *
 * Body: {
 *   vendor_id: string,
 *   service_type: string,
 *   rfq: { requirements: {...}, max_budget: number, currency: "USD" }
 * }
 */
export async function POST(req: NextRequest) {
  const [agent, authError] = await authenticate(req);
  if (authError) return authError;

  const rateLimited = await rateLimit(agent!.id);
  if (rateLimited) return rateLimited;

  if (agent!.type === "vendor") {
    return NextResponse.json(
      { error: "Only buyers can create conversations" },
      { status: 403 }
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid or missing JSON body" },
      { status: 400 }
    );
  }

  const parsed = CreateConversationSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { vendor_id, service_type, rfq } = parsed.data;

  // Verify vendor exists and is active
  const { data: vendor } = await supabase
    .from("agents")
    .select("id, status, type")
    .eq("id", vendor_id)
    .single();

  if (!vendor || vendor.status !== "active") {
    return NextResponse.json(
      { error: "Vendor not found or inactive" },
      { status: 404 }
    );
  }

  if (vendor.type === "buyer") {
    return NextResponse.json(
      { error: "Target agent is not a vendor" },
      { status: 400 }
    );
  }

  // Create conversation
  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({
      buyer_id: agent!.id,
      vendor_id,
      service_type,
      status: "rfq_sent",
      rfq_payload: rfq,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(conv, { status: 201 });
}

/**
 * GET /api/conversations
 *
 * List conversations for the authenticated agent.
 * Filters by role and status.
 *
 * Query params:
 *   status (optional) — filter by conversation status
 *   role   (optional) — 'buyer' or 'vendor' to filter by your role
 */
export async function GET(req: NextRequest) {
  const [agent, authError] = await authenticate(req);
  if (authError) return authError;

  const status = req.nextUrl.searchParams.get("status");
  const role = req.nextUrl.searchParams.get("role");

  let query = supabase.from("conversations").select("*");

  // Filter by agent's participation
  if (role === "buyer") {
    query = query.eq("buyer_id", agent!.id);
  } else if (role === "vendor") {
    query = query.eq("vendor_id", agent!.id);
  } else {
    query = query.or(`buyer_id.eq.${agent!.id},vendor_id.eq.${agent!.id}`);
  }

  if (status) {
    query = query.eq("status", status);
  }

  query = query.order("created_at", { ascending: false }).limit(50);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversations: data ?? [] });
}
