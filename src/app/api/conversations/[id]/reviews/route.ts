import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { recomputeTrust } from "@/lib/trust";
import { z } from "zod";

const ReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
});

/**
 * POST /api/conversations/:id/reviews
 *
 * Submit a rating (1-5) for the counterparty after a completed transaction.
 * - Buyer reviews vendor; vendor reviews buyer.
 * - One review per party per conversation (enforced by DB unique constraint).
 * - Updates the reviewee's reputation_score (rolling average) and recomputes trust.
 *
 * Body: { rating: number }  // 1-5
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [agent, authError] = await authenticate(req);
  if (authError) return authError;

  const rateLimited = await rateLimit(agent!.id);
  if (rateLimited) return rateLimited;

  const { id: conversationId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid or missing JSON body" },
      { status: 400 }
    );
  }

  const parsed = ReviewSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { rating } = parsed.data;

  // Fetch conversation
  const { data: conv, error: fetchErr } = await supabase
    .from("conversations")
    .select("id, buyer_id, vendor_id, status")
    .eq("id", conversationId)
    .single();

  if (fetchErr || !conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Must be a participant
  const isBuyer = conv.buyer_id === agent!.id;
  const isVendor = conv.vendor_id === agent!.id;
  if (!isBuyer && !isVendor) {
    return NextResponse.json(
      { error: "You are not a participant in this conversation" },
      { status: 403 }
    );
  }

  // Only completed conversations can be reviewed
  if (conv.status !== "completed") {
    return NextResponse.json(
      { error: `Reviews are only allowed on completed conversations (current status: ${conv.status})` },
      { status: 422 }
    );
  }

  const revieweeId = isBuyer ? conv.vendor_id : conv.buyer_id;

  // Insert review — DB unique constraint (conversation_id, reviewer_id) prevents duplicates
  const { data: review, error: insertErr } = await supabase
    .from("reviews")
    .insert({
      conversation_id: conversationId,
      reviewer_id: agent!.id,
      reviewee_id: revieweeId,
      rating,
    })
    .select("id, reviewer_id, reviewee_id, rating, created_at")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      return NextResponse.json(
        { error: "You have already submitted a review for this conversation" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Recompute reputation_score for reviewee — rolling average of all their ratings
  const { data: allRatings } = await supabase
    .from("reviews")
    .select("rating")
    .eq("reviewee_id", revieweeId);

  if (allRatings && allRatings.length > 0) {
    const avg = allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;
    await supabase
      .from("agents")
      .update({ reputation_score: Math.round(avg * 100) / 100 })
      .eq("id", revieweeId);
  }

  // Recompute trust score (fire-and-forget — trust depends on reputation)
  recomputeTrust(revieweeId).catch(() => {});

  return NextResponse.json({ review }, { status: 201 });
}

/**
 * GET /api/conversations/:id/reviews
 *
 * List all reviews for a conversation.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [agent, authError] = await authenticate(req);
  if (authError) return authError;

  const { id: conversationId } = await params;

  // Verify participant
  const { data: conv } = await supabase
    .from("conversations")
    .select("buyer_id, vendor_id")
    .eq("id", conversationId)
    .single();

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (conv.buyer_id !== agent!.id && conv.vendor_id !== agent!.id) {
    return NextResponse.json(
      { error: "You are not a participant in this conversation" },
      { status: 403 }
    );
  }

  const { data: reviews } = await supabase
    .from("reviews")
    .select("id, reviewer_id, reviewee_id, rating, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  return NextResponse.json({ reviews: reviews ?? [] });
}
