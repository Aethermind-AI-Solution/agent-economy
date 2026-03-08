import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { validateTransition, type MessageType } from "@/lib/state-machine";
import { createEscrow, releaseEscrow, freezeEscrow } from "@/lib/escrow";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/conversations/:id/messages
 *
 * The core transaction engine. Every state transition goes through here.
 * Validates the transition, executes side effects (escrow), updates state.
 *
 * Body: {
 *   message_type: "offer" | "accept" | "reject" | "deliver" | "confirm" | "dispute",
 *   payload: { ... }  // depends on message type
 * }
 *
 * Payload shapes by message_type:
 *   offer:   { price: number, delivery_time_seconds: number, details: string }
 *   accept:  {} (no payload needed)
 *   reject:  { reason?: string }
 *   deliver: { artifacts: [{ type: string, url: string }], metadata?: object }
 *   confirm: {} (no payload needed)
 *   dispute: { reason: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [agent, authError] = await authenticate(req);
  if (authError) return authError;

  // Rate limit: 60 requests/min per agent
  const rateLimited = rateLimit(agent!.id);
  if (rateLimited) return rateLimited;

  const { id: conversationId } = await params;
  const body = await req.json();
  const { message_type, payload } = body;

  if (!message_type) {
    return NextResponse.json(
      { error: "Required field: message_type" },
      { status: 400 }
    );
  }

  // 1. Fetch conversation
  const { data: conv, error: fetchErr } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (fetchErr || !conv) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  // 2. Determine sender's role
  const isBuyer = conv.buyer_id === agent!.id;
  const isVendor = conv.vendor_id === agent!.id;
  if (!isBuyer && !isVendor) {
    return NextResponse.json(
      { error: "You are not a participant in this conversation" },
      { status: 403 }
    );
  }
  const senderRole = isBuyer ? "buyer" : "vendor";

  // 3. Validate state transition
  const transition = validateTransition(
    conv.status,
    message_type as MessageType,
    senderRole
  );

  if (!transition.valid) {
    return NextResponse.json(
      { error: transition.error },
      { status: 422 }
    );
  }

  // 4. Execute side effects
  if (transition.sideEffect === "create_escrow") {
    // Price comes from the vendor's offer
    const price = conv.offer_payload?.price;
    if (!price || price <= 0) {
      return NextResponse.json(
        { error: "Cannot create escrow: no valid offer price found" },
        { status: 422 }
      );
    }
    const result = await createEscrow(conversationId, conv.buyer_id, price);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 422 }
      );
    }
  }

  if (transition.sideEffect === "release_escrow") {
    const result = await releaseEscrow(conversationId, conv.vendor_id);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }
  }

  if (transition.sideEffect === "freeze_escrow") {
    await freezeEscrow(conversationId);
  }

  // 5. Build update payload
  const update: Record<string, any> = {
    status: transition.newStatus,
  };

  // Store payload in the appropriate column
  if (message_type === "offer" && payload) {
    update.offer_payload = payload;
  } else if (message_type === "deliver" && payload) {
    update.delivery_payload = payload;
  }

  // 6. Update conversation
  const { data: updated, error: updateErr } = await supabase
    .from("conversations")
    .update(update)
    .eq("id", conversationId)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json(
      { error: updateErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    conversation: updated,
    transition: {
      from: conv.status,
      to: transition.newStatus,
      message_type,
      side_effect: transition.sideEffect ?? null,
    },
  });
}
