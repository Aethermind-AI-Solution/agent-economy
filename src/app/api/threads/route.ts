import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { createThread, getMyThreads } from "@/lib/threads";

const CreateThreadSchema = z.object({
  task_type: z.string().min(1, "task_type is required"),
  task_input: z.record(z.unknown()),
});

const ListThreadsSchema = z.object({
  status: z.enum(["pending", "running", "completed", "failed"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

/**
 * POST /api/threads
 * Create a new thread under the authenticated orchestrator agent.
 */
export async function POST(req: NextRequest) {
  const [agent, authError] = await authenticate(req);
  if (authError) return authError;

  const rateLimited = await rateLimit(agent!.id);
  if (rateLimited) return rateLimited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
  }

  const parsed = CreateThreadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { task_type, task_input } = parsed.data;
  const threadId = await createThread(agent!.id, task_type, task_input);

  if (!threadId) {
    return NextResponse.json({ error: "Failed to create thread" }, { status: 500 });
  }

  return NextResponse.json({ thread_id: threadId }, { status: 201 });
}

/**
 * GET /api/threads
 * List threads for the authenticated orchestrator agent.
 */
export async function GET(req: NextRequest) {
  const [agent, authError] = await authenticate(req);
  if (authError) return authError;

  const rateLimited = await rateLimit(agent!.id);
  if (rateLimited) return rateLimited;

  const { searchParams } = new URL(req.url);
  const parsed = ListThreadsSchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query params", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const threads = await getMyThreads(agent!.id, parsed.data.status, parsed.data.limit);
  return NextResponse.json({ threads });
}
