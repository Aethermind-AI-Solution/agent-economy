import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "./supabase";

export interface AuthenticatedAgent {
  id: string;
  name: string;
  type: "buyer" | "vendor" | "both";
  balance: number;
  status: "active" | "suspended";
}

/** Length of the stored key prefix for O(1) lookup */
export const KEY_PREFIX_LENGTH = 20;

/**
 * Validate the API key from Authorization header.
 * Returns the agent record or a 401 response.
 *
 * Auth strategy:
 *   1. Try O(1) prefix lookup (new agents with api_key_prefix set)
 *   2. Fall back to O(n) scan (legacy agents without prefix)
 *
 * Usage in any route:
 *   const [agent, errorRes] = await authenticate(request);
 *   if (errorRes) return errorRes;
 */
export async function authenticate(
  req: NextRequest
): Promise<[AuthenticatedAgent | null, NextResponse | null]> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return [null, NextResponse.json(
      { error: "Missing Authorization header. Use: Bearer <api_key>" },
      { status: 401 }
    )];
  }

  const apiKey = authHeader.slice(7);
  const prefix = apiKey.slice(0, KEY_PREFIX_LENGTH);

  // 1. Fast path: prefix lookup (compare against all prefix matches)
  const { data: prefixMatches } = await supabase
    .from("agents")
    .select("id, name, type, balance, status, api_key_hash")
    .eq("status", "active")
    .eq("api_key_prefix", prefix);

  if (prefixMatches && prefixMatches.length > 0) {
    for (const agent of prefixMatches) {
      const match = await bcrypt.compare(apiKey, agent.api_key_hash);
      if (match) {
        const { api_key_hash, ...safe } = agent;
        return [safe as AuthenticatedAgent, null];
      }
    }
  }

  // 2. Slow path: O(n) scan for legacy agents without prefix
  const { data: agents, error } = await supabase
    .from("agents")
    .select("id, name, type, balance, status, api_key_hash")
    .eq("status", "active")
    .is("api_key_prefix", null);

  if (error || !agents) {
    return [null, NextResponse.json(
      { error: "Auth service unavailable", details: error?.message },
      { status: 500 }
    )];
  }

  for (const agent of agents) {
    const match = await bcrypt.compare(apiKey, agent.api_key_hash);
    if (match) {
      // Backfill prefix for future fast lookups
      await supabase
        .from("agents")
        .update({ api_key_prefix: prefix })
        .eq("id", agent.id);
      const { api_key_hash, ...safe } = agent;
      return [safe as AuthenticatedAgent, null];
    }
  }

  return [null, NextResponse.json(
    { error: "Invalid API key" },
    { status: 401 }
  )];
}
