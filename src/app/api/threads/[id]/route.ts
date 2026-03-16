import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { supabase } from "@/lib/supabase";

const PatchThreadSchema = z.object({
  status: z.enum(["running", "completed", "failed"]),
  result: z.record(z.unknown()).optional(),
  error: z.string().optional(),
});

/**
 * PATCH /api/threads/[id]
 * Update thread status. Only the orchestrator that created the thread can update it.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [agent, authError] = await authenticate(req);
  if (authError) return authError;

  const rateLimited = await rateLimit(agent!.id);
  if (rateLimited) return rateLimited;

  const { id: threadId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
  }

  const parsed = PatchThreadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Verify ownership
  const { data: thread, error: fetchError } = await supabase
    .from("agent_threads")
    .select("*")
    .eq("id", threadId)
    .single();

  if (fetchError || !thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  if (thread.orchestrator_id !== agent!.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { status, result, error: errorMsg } = parsed.data;
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = { status };
  if (status === "running") {
    updates.started_at = now;
  }
  if (status === "completed" || status === "failed") {
    updates.completed_at = now;
  }
  if (result !== undefined) updates.result = result;
  if (errorMsg !== undefined) updates.error = errorMsg;

  const { data: updated, error: updateError } = await supabase
    .from("agent_threads")
    .update(updates)
    .eq("id", threadId)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ thread: updated });
}
