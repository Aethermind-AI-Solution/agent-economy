import { NextRequest, NextResponse } from "next/server";
import { setDraftContacted } from "@/lib/crew-runs";

/**
 * POST /api/crew-runs/[id]/drafts/[draftId]
 * Mark or unmark a draft as contacted. Admin-password auth via form field.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; draftId: string }> }
) {
  const { id, draftId } = await params;

  let key: string | null = null;
  let action: string | null = null;

  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const form = await req.formData();
    key = form.get("key") as string | null;
    action = form.get("action") as string | null;
  } else {
    const body = await req.json().catch(() => ({}));
    key = body.key ?? null;
    action = body.action ?? null;
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword && key !== adminPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contacted = action === "contact";
  await setDraftContacted(draftId, contacted);

  // Redirect back to the crew run detail page
  const keyParam = key ? `?key=${encodeURIComponent(key)}` : "";
  return NextResponse.redirect(new URL(`/crew-runs/${id}${keyParam}`, req.url));
}
