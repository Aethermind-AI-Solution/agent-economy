import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

/**
 * POST /api/agents/register
 *
 * Public endpoint. Registers a new agent on the platform.
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
  const body = await req.json();
  const { name, type, capabilities } = body;

  if (!name || !type) {
    return NextResponse.json(
      { error: "Required fields: name, type (buyer | vendor | both)" },
      { status: 400 }
    );
  }

  if (!["buyer", "vendor", "both"].includes(type)) {
    return NextResponse.json(
      { error: "type must be: buyer, vendor, or both" },
      { status: 400 }
    );
  }

  // Generate API key
  const rawKey = `pk_${type}_${name.toLowerCase().replace(/[^a-z0-9]/g, "")}_${crypto.randomBytes(12).toString("hex")}`;
  const hash = await bcrypt.hash(rawKey, 10);

  const { data: agent, error } = await supabase
    .from("agents")
    .insert({
      name,
      type,
      api_key_hash: hash,
      balance: type === "buyer" || type === "both" ? 25.0 : 0.0, // Free starter credits for buyers
      capabilities: capabilities ?? [],
    })
    .select("id, name, type, balance, capabilities, reputation_score, total_transactions, status, created_at")
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
