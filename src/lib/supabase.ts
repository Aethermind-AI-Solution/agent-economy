// No dotenv here — Next.js dev server loads .env.local automatically.
// Vercel injects env vars at runtime. Only CLI agent files (agents/*.ts) need dotenv.
//
// Lazy initialization: the client is created on first use, not at module load time.
// This lets agent scripts import this module before dotenv.config() has run — the
// error is deferred to when the client is actually called (by which time env vars
// are always set).

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _instance: SupabaseClient | null = null;

function getInstance(): SupabaseClient {
  if (!_instance) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
    }
    _instance = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
  return _instance;
}

// Proxy gives the same API as a SupabaseClient but initializes lazily.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getInstance(), prop, receiver);
  },
});

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
