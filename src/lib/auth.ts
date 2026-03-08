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

/**
 * Validate the API key from Authorization header.
 * Returns the agent record or a 401 response.
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

  // Fetch all active agents and compare hashes.
  // With <100 agents in MVP this is fine.
  // At scale: use a key prefix lookup table.
  const { data: agents, error } = await supabase
    .from("agents")
    .select("id, name, type, balance, status, api_key_hash")
    .eq("status", "active");

  if (error || !agents) {
    return [null, NextResponse.json(
      { error: "Auth service unavailable", details: error?.message },
      { status: 500 }
    )];
  }

  for (const agent of agents) {
    const match = await bcrypt.compare(apiKey, agent.api_key_hash);
    if (match) {
      const { api_key_hash, ...safe } = agent;
      return [safe as AuthenticatedAgent, null];
    }
  }

  return [null, NextResponse.json(
    { error: "Invalid API key" },
    { status: 401 }
  )];
}
