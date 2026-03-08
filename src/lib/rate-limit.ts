/**
 * Rate Limiter
 *
 * Simple sliding-window rate limiter using in-memory store.
 * Limits per API key to prevent buggy agent loops from
 * overwhelming the platform.
 *
 * Defaults: 60 requests per minute per agent.
 * On Vercel serverless, each function instance has its own store —
 * this means limits are per-instance, not global. For MVP this is
 * fine. At scale, swap for Redis (Upstash) which takes 5 minutes.
 */

import { NextResponse } from "next/server";

interface RateEntry {
  timestamps: number[];
}

const store = new Map<string, RateEntry>();

// Clean up old entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - 60_000;
  const keys = Array.from(store.keys());
  for (const key of keys) {
    const entry = store.get(key)!;
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

/**
 * Check if the request should be rate-limited.
 * Returns null if allowed, or a 429 response if blocked.
 *
 * @param key - Unique identifier (usually agent ID or IP)
 * @param maxRequests - Max requests per window (default: 60)
 * @param windowMs - Window size in ms (default: 60000 = 1 minute)
 */
export function rateLimit(
  key: string,
  maxRequests = 60,
  windowMs = 60_000
): NextResponse | null {
  cleanup();

  const now = Date.now();
  const cutoff = now - windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= maxRequests) {
    const retryAfter = Math.ceil(
      (entry.timestamps[0] + windowMs - now) / 1000
    );
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        retry_after_seconds: retryAfter,
        limit: maxRequests,
        window: `${windowMs / 1000}s`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(maxRequests),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  entry.timestamps.push(now);
  return null; // Allowed
}
