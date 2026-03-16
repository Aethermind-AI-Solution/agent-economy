import { NextRequest, NextResponse } from "next/server";
import { setDraftContacted, updateDraftPipeline, type PipelineStatus } from "@/lib/crew-runs";

const VALID_STAGES: PipelineStatus[] = ["new", "contacted", "replied", "interested", "closed", "skipped"];

/**
 * POST /api/crew-runs/[id]/drafts/[draftId]
 * Update a draft: pipeline stage, notes, follow-up date, or contact toggle.
 * Admin-password auth via form field.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; draftId: string }> }
) {
  const { id, draftId } = await params;

  let key: string | null = null;
  let action: string | null = null;
  let pipeline_status: string | null = null;
  let notes: string | null = null;
  let follow_up_date: string | null = null;

  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const form = await req.formData();
    key = form.get("key") as string | null;
    action = form.get("action") as string | null;
    pipeline_status = form.get("pipeline_status") as string | null;
    notes = form.get("notes") as string | null;
    follow_up_date = form.get("follow_up_date") as string | null;
  } else {
    const body = await req.json().catch(() => ({}));
    key = body.key ?? null;
    action = body.action ?? null;
    pipeline_status = body.pipeline_status ?? null;
    notes = body.notes ?? null;
    follow_up_date = body.follow_up_date ?? null;
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword && key !== adminPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keyParam = key ? `?key=${encodeURIComponent(key)}` : "";
  const referer = req.headers.get("referer") ?? "";
  // Redirect back to wherever the form came from (pipeline page or crew run detail)
  const redirectBack = referer.includes("/pipeline")
    ? `/pipeline${keyParam}`
    : `/crew-runs/${id}${keyParam}`;

  if (action === "contact" || action === "uncontact") {
    await setDraftContacted(draftId, action === "contact");
  } else if (action === "pipeline" && pipeline_status && VALID_STAGES.includes(pipeline_status as PipelineStatus)) {
    await updateDraftPipeline(draftId, { pipeline_status: pipeline_status as PipelineStatus });
  } else if (action === "notes") {
    await updateDraftPipeline(draftId, { notes: notes ?? "" });
  } else if (action === "follow_up") {
    await updateDraftPipeline(draftId, { follow_up_date: follow_up_date || null });
  }

  return NextResponse.redirect(new URL(redirectBack, req.url));
}
