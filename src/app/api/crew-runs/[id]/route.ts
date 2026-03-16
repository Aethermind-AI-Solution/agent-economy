import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getCrewRun } from "@/lib/crew-runs";

/**
 * GET /api/crew-runs/[id]
 * Get a single crew run with its drafts. Requires agent Bearer auth.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [agent, authError] = await authenticate(req);
  if (authError) return authError;

  const rateLimited = await rateLimit(agent!.id);
  if (rateLimited) return rateLimited;

  const { id } = await params;
  const result = await getCrewRun(id);

  if (!result) {
    return NextResponse.json({ error: "Crew run not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
