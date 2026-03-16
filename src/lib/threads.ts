import { supabase } from "./supabase";

export interface Thread {
  id: string;
  orchestrator_id: string;
  task_type: string;
  task_input: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  result: Record<string, unknown> | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

/**
 * Create a new thread for an orchestrator agent.
 * Returns the threadId or "" on error (never throws).
 */
export async function createThread(
  orchestratorId: string,
  taskType: string,
  taskInput: Record<string, unknown>
): Promise<string> {
  const { data, error } = await supabase
    .from("agent_threads")
    .insert({ orchestrator_id: orchestratorId, task_type: taskType, task_input: taskInput })
    .select("id")
    .single();
  if (error) {
    console.error(
      JSON.stringify({ event: "create_thread_error", orchestrator_id: orchestratorId, error: error.message })
    );
    return "";
  }
  return data.id as string;
}

/**
 * Mark a thread as running. Never throws.
 */
export async function startThread(threadId: string): Promise<void> {
  const { error } = await supabase
    .from("agent_threads")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", threadId);
  if (error) {
    console.error(
      JSON.stringify({ event: "start_thread_error", thread_id: threadId, error: error.message })
    );
  }
}

/**
 * Mark a thread as completed with its result. Never throws.
 */
export async function completeThread(
  threadId: string,
  result: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("agent_threads")
    .update({ status: "completed", result, completed_at: new Date().toISOString() })
    .eq("id", threadId);
  if (error) {
    console.error(
      JSON.stringify({ event: "complete_thread_error", thread_id: threadId, error: error.message })
    );
  }
}

/**
 * Mark a thread as failed with an error message. Never throws.
 */
export async function failThread(threadId: string, errorMsg: string): Promise<void> {
  const { error } = await supabase
    .from("agent_threads")
    .update({ status: "failed", error: errorMsg, completed_at: new Date().toISOString() })
    .eq("id", threadId);
  if (error) {
    console.error(
      JSON.stringify({ event: "fail_thread_error", thread_id: threadId, error: error.message })
    );
  }
}

/**
 * Fetch threads for an orchestrator, optionally filtered by status.
 * Returns [] on error (never throws).
 */
export async function getMyThreads(
  orchestratorId: string,
  status?: Thread["status"],
  limit = 20
): Promise<Thread[]> {
  let query = supabase
    .from("agent_threads")
    .select("*")
    .eq("orchestrator_id", orchestratorId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    console.error(
      JSON.stringify({ event: "get_threads_error", orchestrator_id: orchestratorId, error: error.message })
    );
    return [];
  }
  return (data ?? []) as Thread[];
}
