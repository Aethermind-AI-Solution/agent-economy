import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * GET /api/conversations/:id/export
 *
 * Downloads the delivery artifact as a CSV file.
 * Supports artifact types: scored_leads, outreach_drafts.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: conv, error } = await supabase
    .from("conversations")
    .select("delivery_payload, service_type")
    .eq("id", id)
    .single();

  if (error || !conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const artifact = conv.delivery_payload?.artifacts?.[0];
  if (!artifact) {
    return NextResponse.json({ error: "No delivery artifact" }, { status: 404 });
  }

  let csv = "";
  let filename = "export.csv";

  if (artifact.type === "scored_leads") {
    filename = `leads-${id.slice(0, 8)}.csv`;
    const headers = ["company_name", "industry", "company_size", "score", "decision_maker", "contact_info", "pain_points", "recommended_solution"];
    csv = headers.join(",") + "\n";
    for (const lead of artifact.data ?? []) {
      csv += [
        csvCell(lead.company_name),
        csvCell(lead.industry),
        csvCell(lead.company_size),
        lead.score ?? "",
        csvCell(lead.decision_maker),
        csvCell(lead.contact_info),
        csvCell((lead.pain_points ?? []).join("; ")),
        csvCell(lead.recommended_solution),
      ].join(",") + "\n";
    }
  } else if (artifact.type === "outreach_drafts") {
    filename = `outreach-${id.slice(0, 8)}.csv`;
    const headers = ["company_name", "decision_maker", "score", "subject_line", "email_body", "linkedin_message"];
    csv = headers.join(",") + "\n";
    for (const draft of artifact.data ?? []) {
      csv += [
        csvCell(draft.company_name),
        csvCell(draft.decision_maker),
        draft.score ?? "",
        csvCell(draft.subject_line),
        csvCell(draft.email_body),
        csvCell(draft.linkedin_message),
      ].join(",") + "\n";
    }
  } else {
    return NextResponse.json(
      { error: `Artifact type '${artifact.type}' is not exportable as CSV` },
      { status: 400 }
    );
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function csvCell(value: unknown): string {
  const s = String(value ?? "").replace(/"/g, '""');
  return `"${s}"`;
}
