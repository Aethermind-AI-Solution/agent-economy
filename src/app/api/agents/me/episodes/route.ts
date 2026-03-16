import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { supabase } from "@/lib/supabase";
import { getRelevantEpisodes } from "@/lib/episodes";

export async function GET(req: NextRequest) {
  const [agent, authError] = await authenticate(req);
  if (authError) return authError;

  const rateLimited = await rateLimit(agent!.id);
  if (rateLimited) return rateLimited;

  const { searchParams } = new URL(req.url);
  const taskType = searchParams.get("task_type") ?? undefined;
  const rawLimit = parseInt(searchParams.get("limit") ?? "5", 10);
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 5 : rawLimit), 20);

  let episodes;
  if (taskType) {
    episodes = await getRelevantEpisodes(agent!.id, taskType, limit);
  } else {
    const { data, error } = await supabase
      .from("agent_episodes")
      .select("*")
      .eq("agent_id", agent!.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    episodes = data ?? [];
  }

  return NextResponse.json({ episodes });
}
