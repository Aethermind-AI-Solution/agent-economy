import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { authenticate } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { listCrewRuns, createCrewRun } from "@/lib/crew-runs";
import { supabase as db } from "@/lib/supabase";

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

  // Mark stale "running" records as failed (process killed, e.g. Vercel 60s limit)
  db.from("crew_runs")
    .update({ status: "failed", error: "Timed out — process was killed" })
    .eq("status", "running")
    .lt("started_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .then(() => {});

  const runs = await listCrewRuns(limit);
  return NextResponse.json({ runs });
}

/**
 * POST /api/crew-runs
 * Trigger a new crew run. Admin-password auth via form field or JSON body.
 *
 * NOTE: The crew takes ~4 minutes. This handler creates the run record and
 * spawns run-crew.ts as a detached background process, then redirects immediately.
 * On Vercel free tier (60s function timeout) the background process is killed —
 * use `npm run crew "<query>"` from the terminal for reliable execution.
 * On Vercel Pro, add `export const maxDuration = 300;` to this file.
 */
export async function POST(req: NextRequest) {
  let key: string | null = null;
  let query: string | null = null;

  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const form = await req.formData();
    key = form.get("key") as string | null;
    query = form.get("query") as string | null;
  } else {
    const body = await req.json().catch(() => ({}));
    key = body.key ?? null;
    query = body.query ?? null;
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    // In production, missing ADMIN_PASSWORD is a misconfiguration — refuse all requests
    if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
      console.error("FATAL: ADMIN_PASSWORD not set — refusing crew-run trigger");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }
    // Local dev without password: allow (convenience)
  } else if (key !== adminPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!query || query.trim().length < 10) {
    return NextResponse.json({ error: "query must be at least 10 characters" }, { status: 400 });
  }

  // On Vercel, child processes are not supported — redirect with a hint
  // so the user knows to run from the terminal instead.
  if (process.env.VERCEL === "1") {
    const keyParam = key ? `key=${encodeURIComponent(key)}&` : "";
    return NextResponse.redirect(
      new URL(`/?${keyParam}crew_msg=${encodeURIComponent(query.trim())}`, req.url)
    );
  }

  // Local dev: create the run record and spawn the background process.
  const runId = await createCrewRun(query.trim());

  const cwd = process.cwd();
  const tsxBin = path.join(cwd, "node_modules", ".bin", "tsx");
  const scriptPath = path.join(cwd, "agents", "run-crew.ts");

  try {
    const child = spawn(tsxBin, [scriptPath, query.trim()], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, RUN_ID: runId },
      cwd,
    });
    child.unref();
  } catch {
    // Spawn failed — run is still recorded, user can trigger via CLI
  }

  // Redirect back to dashboard
  const keyParam = key ? `?key=${encodeURIComponent(key)}` : "";
  return NextResponse.redirect(new URL(`/${keyParam}`, req.url));
}
