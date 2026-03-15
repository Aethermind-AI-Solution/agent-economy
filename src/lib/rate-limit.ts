/**
 * Rate Limiter — Supabase-backed
 *
 * Uses a Postgres table (agent_rate_limits) so all Vercel serverless
 * instances share the same counter. The old in-memory Map reset on
 * every cold start, making limits per-instance rather than global.
 *
 * Window strategy: floor(now / windowMs) → all instances agree on
 * the same bucket key regardless of clock skew.
 *
 * Defaults: 60 requests per 60-second window per agent.
 * Register route: 5 requests per hour per IP.
 */

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * Check if the request should be rate-limited.
 * Returns null if allowed, or a 429 response if blocked.
 *
 * @param key         - Unique identifier (agent ID or "register:{ip}")
 * @param maxRequests - Max requests per window (default: 60)
 * @param windowMs    - Window size in ms (default: 60000 = 1 minute)
 */
export async function rateLimit(
  key: string,
  maxRequests = 60,
  windowMs = 60_000
): Promise<NextResponse | null> {
  // Bucket the current time into fixed windows so all instances agree
  const windowStart = new Date(
    Math.floor(Date.now() / windowMs) * windowMs
  ).toISOString();

  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_window_start: windowStart,
    p_limit: maxRequests,
  });

  if (error) {
    // If the RPC fails (e.g. migration not yet run), fail open so agents
    // aren't blocked by a rate-limit infrastructure outage.
    console.error("[rate-limit] RPC error, failing open:", error.message);
    return null;
  }

  if (!data?.allowed) {
    const retryAfterSec = Math.ceil(
      (Math.floor(Date.now() / windowMs) * windowMs + windowMs - Date.now()) / 1000
    );
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        retry_after_seconds: retryAfterSec,
        limit: maxRequests,
        window: `${windowMs / 1000}s`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
          "X-RateLimit-Limit": String(maxRequests),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  return null; // Allowed
}
