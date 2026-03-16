import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/cron/expire-conversations
 *
 * Vercel Cron job — runs every 5 minutes (see vercel.json).
 * Vercel automatically sends Authorization: Bearer $CRON_SECRET.
 *
 * Actions:
 * 1. Expire rfq_sent / offer_sent conversations past their expires_at
 * 2. Expire accepted conversations past expires_at → freeze escrow for admin review
 * 3. Clean up old rate limit rows (> 2 hours old)
 * 4. Clean up old idempotency cache rows (> 24 hours old)
 */
export async function GET(req: NextRequest) {
  // Guard: only Vercel cron (or manual callers with the secret) may run this
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // 1. Expire non-funded conversations (rfq_sent, offer_sent, delivered) — safe, no escrow
  //    Covers both: explicit expires_at exceeded, AND conversations with no expires_at
  //    that are older than 1 hour (e.g. created by crew agents that were killed).
  const { data: expiredSafe, error: err1 } = await supabase
    .from("conversations")
    .update({ status: "expired", updated_at: now })
    .in("status", ["rfq_sent", "offer_sent", "delivered"])
    .or(`expires_at.lt.${now},and(expires_at.is.null,created_at.lt.${oneHourAgo})`)
    .select("id");

  if (err1) {
    console.error("[cron] error expiring safe conversations:", err1.message);
  }

  // 2. Expire accepted conversations — escrow is locked, freeze it for admin review
  const { data: expiredAccepted, error: err2 } = await supabase
    .from("conversations")
    .update({ status: "expired", escrow_frozen: true, updated_at: now })
    .eq("status", "accepted")
    .or(`expires_at.lt.${now},and(expires_at.is.null,created_at.lt.${oneHourAgo})`)
    .select("id");

  if (err2) {
    console.error("[cron] error expiring accepted conversations:", err2.message);
  }

  // 3. Clean up old rate limit rows (older than 2 hours)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { error: err3 } = await supabase
    .from("agent_rate_limits")
    .delete()
    .lt("window_start", twoHoursAgo);

  if (err3) {
    console.error("[cron] error cleaning rate limits:", err3.message);
  }

  // 4. Clean up old idempotency cache rows (older than 24 hours)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { error: err4 } = await supabase
    .from("idempotency_cache")
    .delete()
    .lt("created_at", oneDayAgo);

  if (err4) {
    console.error("[cron] error cleaning idempotency cache:", err4.message);
  }

  const safeCount = expiredSafe?.length ?? 0;
  const acceptedCount = expiredAccepted?.length ?? 0;

  console.log(JSON.stringify({
    event: "cron_expire",
    expired_safe: safeCount,
    expired_accepted: acceptedCount,
    ran_at: now,
  }));

  return NextResponse.json({
    expired_safe: safeCount,
    expired_accepted: acceptedCount,
    expired_at: now,
  });
}
