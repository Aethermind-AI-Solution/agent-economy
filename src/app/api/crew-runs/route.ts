import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { listCrewRuns } from "@/lib/crew-runs";

/**
 * GET /api/crew-runs
 * List recent crew runs. Requires agent Bearer auth.
 */
export async function GET(req: NextRequest) {
  const [agent, authError] = await authenticate(req);
  if (authError) return authError;

  const rateLimited = await rateLimit(agent!.id);
  if (rateLimited) return rateLimited;

  const { searchParams } = new URL(req.url);
  const rawLimit = parseInt(searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(50, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit));

  const runs = await listCrewRuns(limit);
  return NextResponse.json({ runs });
}
