import { NextRequest, NextResponse } from "next/server";
import { getCrewRun } from "@/lib/crew-runs";

function csvCell(value: unknown): string {
  const s = String(value ?? "").replace(/"/g, '""');
  return `"${s}"`;
}

/**
 * GET /api/crew-runs/[id]/export
 * Download all drafts for a crew run as CSV.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword) {
    const key = new URL(req.url).searchParams.get("key");
    if (key !== adminPassword) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await getCrewRun(id);
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const headers = [
    "company_name", "industry", "decision_maker", "score",
    "subject_line", "email_body", "linkedin_message", "contacted",
  ];

  let csv = headers.join(",") + "\n";
  for (const draft of result.drafts) {
    csv += [
      csvCell(draft.company_name),
      csvCell(draft.industry),
      csvCell(draft.decision_maker),
      draft.score ?? "",
      csvCell(draft.subject_line),
      csvCell(draft.email_body),
      csvCell(draft.linkedin_message),
      draft.contacted_at ? "yes" : "no",
    ].join(",") + "\n";
  }

  const filename = `outreach-run-${id.slice(0, 8)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
