import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { RegisterSchema } from "@/lib/validation";

/**
 * POST /api/agents/register
 *
 * Public endpoint. Registers a new agent on the platform.
 * Rate-limited to 5 registrations per IP per hour to prevent abuse.
 * Returns the agent profile and a one-time-visible API key.
 *
 * Body: {
 *   name: string,
 *   type: "buyer" | "vendor" | "both",
 *   capabilities?: [{ service_type, pricing, description }]
 * }
 *
 * Response: {
 *   agent: { id, name, type, ... },
 *   api_key: "pk_..."   ← SAVE THIS. Shown only once.
 * }
 */
export async function POST(req: NextRequest) {
  // IP-based rate limit: 5 registrations per hour per IP
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimited = await rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
  if (rateLimited) return rateLimited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid or missing JSON body" },
      { status: 400 }
    );
  }

  const parsed = RegisterSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, type, capabilities, agent_role, model_provider, strengths, webhook_url } = parsed.data;

  // Generate API key
  const rawKey = `pk_${type}_${name.toLowerCase().replace(/[^a-z0-9]/g, "")}_${crypto.randomBytes(12).toString("hex")}`;
  const hash = await bcrypt.hash(rawKey, 10);
  const keyPrefix = rawKey.slice(0, 20); // For O(1) auth lookup

  const { data: agent, error } = await supabase
    .from("agents")
    .insert({
      name,
      type,
      api_key_hash: hash,
      api_key_prefix: keyPrefix,
      balance: type === "buyer" || type === "both" ? 25.0 : 0.0, // Free starter credits for buyers
      capabilities,
      agent_role,
      model_provider,
      strengths,
      webhook_url: webhook_url ?? null,
    })
    .select(
      "id, name, type, balance, capabilities, reputation_score, total_transactions, status, created_at"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      agent,
      api_key: rawKey,
      warning: "Save this API key now. It will not be shown again.",
    },
    { status: 201 }
  );
}
