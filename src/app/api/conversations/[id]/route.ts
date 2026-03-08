import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getAllowedActions } from "@/lib/state-machine";

/**
 * GET /api/conversations/:id
 *
 * Get full conversation details including payloads and status.
 * Returns allowed next actions for the authenticated agent.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [agent, authError] = await authenticate(req);
  if (authError) return authError;

  const { id } = await params;

  const { data: conv, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !conv) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  // Ensure agent is a participant
  const isBuyer = conv.buyer_id === agent!.id;
  const isVendor = conv.vendor_id === agent!.id;
  if (!isBuyer && !isVendor) {
    return NextResponse.json(
      { error: "You are not a participant in this conversation" },
      { status: 403 }
    );
  }

  const role = isBuyer ? "buyer" : "vendor";
  const allowedActions = getAllowedActions(conv.status, role);

  return NextResponse.json({
    ...conv,
    your_role: role,
    allowed_actions: allowedActions,
  });
}
