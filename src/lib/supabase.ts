// No dotenv here — Next.js dev server loads .env.local automatically.
// Vercel injects env vars at runtime. Only CLI agent files (agents/*.ts) need dotenv.

import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
}

// Service role client — bypasses RLS for admin operations.
// API routes set app.current_agent_id for RLS when needed.
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Run a callback within an RLS-scoped context.
 * Sets the session variable so Postgres RLS policies
 * know which agent is making the request.
 *
 * Requires the set_config() RPC from migration 002.
 */
export async function withAgentScope<T>(
  agentId: string,
  fn: () => Promise<T>
): Promise<T> {
  await supabase.rpc("set_config", {
    setting: "app.current_agent_id",
    value: agentId,
  });
  return fn();
}
