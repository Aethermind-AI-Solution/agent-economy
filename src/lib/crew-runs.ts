import { supabase } from "./supabase";

export interface CrewRun {
  id: string;
  query: string;
  status: "running" | "completed" | "failed";
  company_count: number | null;
  lead_count: number | null;
  draft_count: number | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export type PipelineStatus = "new" | "contacted" | "replied" | "interested" | "closed" | "skipped";

export interface CrewDraft {
  id: string;
  crew_run_id: string;
  company_name: string;
  industry: string | null;
  decision_maker: string | null;
  score: number | null;
  subject_line: string | null;
  email_body: string | null;
  linkedin_message: string | null;
  contacted_at: string | null;
  pipeline_status: PipelineStatus;
  notes: string | null;
  follow_up_date: string | null;
  created_at: string;
}

export async function createCrewRun(query: string): Promise<string> {
  const { data, error } = await supabase
    .from("crew_runs")
    .insert({ query })
    .select("id")
    .single();
  if (error) {
    console.error(JSON.stringify({ event: "create_crew_run_error", error: error.message }));
    return "";
  }
  return data.id as string;
}

export async function completeCrewRun(
  runId: string,
  counts: { company_count: number; lead_count: number; draft_count: number }
): Promise<void> {
  const { error } = await supabase
    .from("crew_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      ...counts,
    })
    .eq("id", runId);
  if (error) {
    console.error(JSON.stringify({ event: "complete_crew_run_error", run_id: runId, error: error.message }));
  }
}

export async function failCrewRun(runId: string, errorMsg: string): Promise<void> {
  const { error } = await supabase
    .from("crew_runs")
    .update({
      status: "failed",
      error: errorMsg,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) {
    console.error(JSON.stringify({ event: "fail_crew_run_error", run_id: runId, error: error.message }));
  }
}

export async function saveDrafts(
  runId: string,
  drafts: Array<{
    company_name: string;
    industry?: string;
    decision_maker?: string;
    score?: number;
    subject_line?: string;
    email_body?: string;
    linkedin_message?: string;
  }>
): Promise<void> {
  if (drafts.length === 0) return;
  const rows = drafts.map((d) => ({
    crew_run_id: runId,
    company_name: d.company_name,
    industry: d.industry ?? null,
    decision_maker: d.decision_maker ?? null,
    score: d.score ?? null,
    subject_line: d.subject_line ?? null,
    email_body: d.email_body ?? null,
    linkedin_message: d.linkedin_message ?? null,
  }));
  const { error } = await supabase.from("crew_run_drafts").insert(rows);
  if (error) {
    console.error(JSON.stringify({ event: "save_drafts_error", run_id: runId, error: error.message }));
  }
}

export async function listCrewRuns(limit = 20): Promise<CrewRun[]> {
  const { data, error } = await supabase
    .from("crew_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error(JSON.stringify({ event: "list_crew_runs_error", error: error.message }));
    return [];
  }
  return (data ?? []) as CrewRun[];
}

export async function updateDraftPipeline(
  draftId: string,
  fields: {
    pipeline_status?: PipelineStatus;
    notes?: string;
    follow_up_date?: string | null;
  }
): Promise<void> {
  const update: Record<string, unknown> = { ...fields };

  // Only set contacted_at the first time (when moving out of 'new' and not to 'skipped')
  const shouldSetContacted =
    fields.pipeline_status &&
    fields.pipeline_status !== "new" &&
    fields.pipeline_status !== "skipped";

  if (shouldSetContacted) {
    const { data: current } = await supabase
      .from("crew_run_drafts")
      .select("contacted_at")
      .eq("id", draftId)
      .single();

    if (!current?.contacted_at) {
      update.contacted_at = new Date().toISOString();
    }
  }

  const { error } = await supabase
    .from("crew_run_drafts")
    .update(update)
    .eq("id", draftId);
  if (error) {
    console.error(JSON.stringify({ event: "update_draft_pipeline_error", draft_id: draftId, error: error.message }));
  }
}

export async function listAllDrafts(
  pipelineStatus?: PipelineStatus | "all",
  limit = 200
): Promise<(CrewDraft & { crew_run_query: string })[]> {
  let q = supabase
    .from("crew_run_drafts")
    .select("*, crew_runs(query)")
    .order("score", { ascending: false })
    .limit(limit);

  if (pipelineStatus && pipelineStatus !== "all") {
    q = q.eq("pipeline_status", pipelineStatus);
  }

  const { data, error } = await q;
  if (error) {
    console.error(JSON.stringify({ event: "list_all_drafts_error", error: error.message }));
    return [];
  }
  return (data ?? []).map((d: any) => ({
    ...d,
    crew_run_query: d.crew_runs?.query ?? "",
  }));
}

export async function setDraftContacted(
  draftId: string,
  contacted: boolean
): Promise<void> {
  const { error } = await supabase
    .from("crew_run_drafts")
    .update({ contacted_at: contacted ? new Date().toISOString() : null })
    .eq("id", draftId);
  if (error) {
    console.error(JSON.stringify({ event: "set_draft_contacted_error", draft_id: draftId, error: error.message }));
  }
}

export async function getCrewRun(
  runId: string
): Promise<{ run: CrewRun; drafts: CrewDraft[] } | null> {
  const [runResult, draftsResult] = await Promise.all([
    supabase.from("crew_runs").select("*").eq("id", runId).single(),
    supabase
      .from("crew_run_drafts")
      .select("*")
      .eq("crew_run_id", runId)
      .order("score", { ascending: false }),
  ]);

  if (runResult.error || !runResult.data) {
    if (runResult.error?.code !== "PGRST116") {
      console.error(JSON.stringify({ event: "get_crew_run_error", run_id: runId, error: runResult.error?.message }));
    }
    return null;
  }

  return {
    run: runResult.data as CrewRun,
    drafts: (draftsResult.data ?? []) as CrewDraft[],
  };
}
