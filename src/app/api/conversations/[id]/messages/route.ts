import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { validateTransition, type MessageType } from "@/lib/state-machine";
import { createEscrow, releaseEscrow, freezeEscrow } from "@/lib/escrow";
import { rateLimit } from "@/lib/rate-limit";
import { SendMessageSchema } from "@/lib/validation";

/**
 * POST /api/conversations/:id/messages
 *
 * The core transaction engine. Every state transition goes through here.
 * Validates the transition, executes side effects (escrow), updates state.
 *
 * Supports idempotent retries via the Idempotency-Key header.
 * If the same key is sent twice, the cached response is returned.
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
  const rateLimited = await rateLimit(agent!.id);
  if (rateLimited) return rateLimited;

  const { id: conversationId } = await params;

  // Idempotency: if the client retried with the same key, return cached response
  const idempotencyKey = req.headers.get("idempotency-key");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid or missing JSON body" },
      { status: 400 }
    );
  }

  const parsed = SendMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { message_type, payload } = parsed.data;

  // Check idempotency cache before doing anything
  if (idempotencyKey) {
    const cacheKey = `${conversationId}:${message_type}:${idempotencyKey}`;
    const { data: cached } = await supabase
      .from("idempotency_cache")
      .select("response")
      .eq("key", cacheKey)
      .single();

    if (cached) {
      return NextResponse.json(cached.response, { status: 200 });
    }
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
    const result = await freezeEscrow(conversationId);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to freeze escrow" },
        { status: 500 }
      );
    }
  }

  // 5. Build update payload
  const update: Record<string, unknown> = {
    status: transition.newStatus,
  };

  // Store payload in the appropriate column
  if (message_type === "offer" && payload) {
    update.offer_payload = payload;
  } else if (message_type === "deliver" && payload) {
    update.delivery_payload = payload;
  }

  // 6. Update conversation — include status guard to prevent race conditions.
  //    If another request changed the status already, 0 rows match → 409 Conflict.
  const { data: updated, error: updateErr } = await supabase
    .from("conversations")
    .update(update)
    .eq("id", conversationId)
    .eq("status", conv.status)
    .select()
    .single();

  if (updateErr || !updated) {
    // If status changed between validation and update → race condition (409 Conflict)
    return NextResponse.json(
      { error: "Conflict: conversation status changed concurrently. Retry." },
      { status: 409 }
    );
  }

  const responseBody = {
    conversation: updated,
    transition: {
      from: conv.status,
      to: transition.newStatus,
      message_type,
      side_effect: transition.sideEffect ?? null,
    },
  };

  // 7. Fire-and-forget: audit log + idempotency cache (never block response)
  Promise.all([
    // Audit log
    supabase.from("conversation_events").insert({
      conversation_id: conversationId,
      from_status: conv.status,
      to_status: transition.newStatus,
      actor_id: agent!.id,
      actor_role: senderRole,
      message_type,
      side_effect: transition.sideEffect ?? null,
    }),
    // Idempotency cache
    idempotencyKey
      ? supabase.from("idempotency_cache").insert({
          key: `${conversationId}:${message_type}:${idempotencyKey}`,
          response: responseBody,
        })
      : Promise.resolve(),
  ]).catch((err) =>
    console.error(JSON.stringify({ event: "post_transition_error", conversationId, error: err?.message }))
  );

  console.log(JSON.stringify({
    event: "state_transition",
    conversationId,
    from: conv.status,
    to: transition.newStatus,
    message_type,
    actor: agent!.id,
    side_effect: transition.sideEffect ?? null,
  }));

  return NextResponse.json(responseBody);
}
