import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * POST /api/admin/disputes/:id
 *
 * Admin-only endpoint to resolve disputed transactions.
 * Accepts both JSON body (API clients) and form submissions (dashboard buttons).
 *
 * Body / Form fields:
 *   action: "release" — pay vendor (minus 5% platform fee)
 *   action: "refund"  — return funds to buyer
 *   key:    string    — must match ADMIN_PASSWORD env var
 *
 * Note: "release" calls the existing release_escrow RPC which checks
 * escrow_frozen. We must unfreeze first, then release.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;

  // Parse body — support both JSON and form submissions
  let action: string | undefined;
  let key: string | undefined;

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = await req.json();
      action = body.action;
      key = body.key;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }
  } else {
    // Form submission (application/x-www-form-urlencoded)
    const form = await req.formData();
    action = form.get("action")?.toString();
    key = form.get("key")?.toString();
  }

  // Authenticate admin
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json(
      { error: "ADMIN_PASSWORD not configured" },
      { status: 503 }
    );
  }
  if (key !== adminPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (action !== "release" && action !== "refund") {
    return NextResponse.json(
      { error: "action must be 'release' or 'refund'" },
      { status: 422 }
    );
  }

  // Verify conversation exists and is disputed
  const { data: conv, error: fetchErr } = await supabase
    .from("conversations")
    .select("id, status, escrow_amount, escrow_frozen")
    .eq("id", conversationId)
    .single();

  if (fetchErr || !conv) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  if (conv.status !== "disputed" && conv.status !== "expired") {
    return NextResponse.json(
      { error: `Cannot resolve conversation in '${conv.status}' status` },
      { status: 422 }
    );
  }

  if (action === "release") {
    // Unfreeze escrow first, then release to vendor
    await supabase
      .from("conversations")
      .update({ escrow_frozen: false })
      .eq("id", conversationId);

    const { data: result, error: rpcErr } = await supabase.rpc(
      "release_escrow",
      { p_conversation_id: conversationId }
    );

    if (rpcErr || !result?.success) {
      return NextResponse.json(
        { error: rpcErr?.message ?? result?.error ?? "Release failed" },
        { status: 500 }
      );
    }

    // Mark completed
    await supabase
      .from("conversations")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    const redirectUrl = new URL(req.url);
    // If form submission, redirect back to dashboard.
    // Use HttpOnly cookie instead of query param — password must not appear in URL
    // (browser history, server access logs, and Referer headers would expose it).
    if (!contentType.includes("application/json")) {
      const res = NextResponse.redirect(new URL("/", redirectUrl.origin));
      res.cookies.set("admin_key", key!, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60, // 1 hour
      });
      return res;
    }

    return NextResponse.json({
      success: true,
      action: "release",
      payout: result.payout,
    });
  }

  if (action === "refund") {
    const { data: result, error: rpcErr } = await supabase.rpc(
      "refund_escrow",
      { p_conversation_id: conversationId }
    );

    if (rpcErr || !result?.success) {
      return NextResponse.json(
        { error: rpcErr?.message ?? result?.error ?? "Refund failed" },
        { status: 500 }
      );
    }

    const redirectUrl = new URL(req.url);
    if (!contentType.includes("application/json")) {
      const res = NextResponse.redirect(new URL("/", redirectUrl.origin));
      res.cookies.set("admin_key", key!, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60,
      });
      return res;
    }

    return NextResponse.json({
      success: true,
      action: "refund",
      refunded: result.refunded,
    });
  }
}
