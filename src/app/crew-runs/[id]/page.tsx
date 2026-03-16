import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import type { CrewRun, CrewDraft } from "@/lib/crew-runs";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

function scoreBadge(score: number | null) {
  const s = score ?? 0;
  const bg = s >= 9 ? "#05966922" : s >= 7 ? "#3b82f622" : "#ca8a0422";
  const color = s >= 9 ? "#059669" : s >= 7 ? "#3b82f6" : "#ca8a04";
  return (
    <span style={{
      fontFamily: "JetBrains Mono, monospace", fontSize: 13, fontWeight: 700,
      padding: "3px 10px", borderRadius: 4, background: bg, color,
    }}>
      {s}/10
    </span>
  );
}

function statusPill(status: string) {
  const color = status === "completed" ? "#059669" : status === "running" ? "#ea580c" : "#dc2626";
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
      fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase" as const,
      background: color + "22", color,
    }}>{status}</span>
  );
}

function duration(run: CrewRun) {
  if (!run.completed_at) return null;
  const ms = new Date(run.completed_at).getTime() - new Date(run.started_at).getTime();
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export default async function CrewRunDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { id } = await params;
  const { key } = await searchParams;

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword && key !== adminPassword) {
    return (
      <html lang="en">
        <head><title>Access Denied</title></head>
        <body style={{ fontFamily: "system-ui", display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", margin: 0, background: "#0f172a", color: "#94a3b8" }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ color: "#e2e8f0" }}>🔒 Access Denied</h1>
            <p>Append <code>?key=YOUR_PASSWORD</code> to the URL.</p>
          </div>
        </body>
      </html>
    );
  }

  const [{ data: run }, { data: drafts }] = await Promise.all([
    supabase.from("crew_runs").select("*").eq("id", id).single(),
    supabase.from("crew_run_drafts").select("*").eq("crew_run_id", id).order("score", { ascending: false }),
  ]);

  if (!run) notFound();

  const keyParam = key ? `?key=${encodeURIComponent(key)}` : "";
  const exportUrl = `/api/crew-runs/${id}/export${keyParam}`;
  const backUrl = `/${keyParam}`;
  const dur = duration(run as CrewRun);

  return (
    <html lang="en">
      <head>
        <title>Crew Run {id.slice(0, 8)} — Agent Economy</title>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ fontFamily: "DM Sans, sans-serif", background: "#0a0a0f", color: "#e4e4ef", minHeight: "100vh", margin: 0 }}>

        {/* Header */}
        <div style={{ padding: "20px 40px", borderBottom: "1px solid #2a2a3a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 18, fontWeight: 700 }}>
            <span style={{ color: "#3b82f6" }}>agent</span>economy
          </div>
          <a href={backUrl} style={{ color: "#8888a0", fontSize: 14, textDecoration: "none" }}>← Back to Dashboard</a>
        </div>

        <div style={{ padding: "32px 40px", maxWidth: 960 }}>

          {/* Run header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <h1 style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 20, fontWeight: 700, margin: 0 }}>
                Crew Run
              </h1>
              {statusPill(run.status)}
            </div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "#555570", marginBottom: 12 }}>{id}</div>
            <div style={{
              background: "#12121a", border: "1px solid #2a2a3a", borderRadius: 8,
              padding: "12px 16px", fontSize: 14, marginBottom: 16,
            }}>
              <span style={{ color: "#8888a0", fontSize: 11, fontFamily: "JetBrains Mono, monospace", marginRight: 8, textTransform: "uppercase", letterSpacing: 1 }}>Query</span>
              <strong>{run.query}</strong>
            </div>

            {/* Meta row */}
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" as const, marginBottom: 16 }}>
              {[
                { label: "Companies", value: run.company_count ?? "—" },
                { label: "Leads", value: run.lead_count ?? "—" },
                { label: "Drafts", value: run.draft_count ?? "—" },
                { label: "Started", value: new Date(run.started_at).toLocaleString() },
                { label: "Duration", value: dur ?? "—" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "#8888a0", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "JetBrains Mono, monospace" }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10 }}>
              <a
                href={exportUrl}
                style={{
                  display: "inline-block", padding: "7px 16px", borderRadius: 6,
                  fontSize: 12, fontFamily: "JetBrains Mono, monospace", fontWeight: 600,
                  background: "#059669", color: "white", textDecoration: "none",
                }}
              >
                ↓ Export CSV
              </a>
            </div>
          </div>

          {/* Drafts */}
          {(drafts ?? []).length === 0 ? (
            <div style={{ color: "#8888a0", fontSize: 14 }}>No drafts yet — run may still be in progress.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {(drafts as CrewDraft[]).map((draft, i) => (
                <div key={draft.id} style={{
                  background: "#12121a", border: `1px solid ${draft.contacted_at ? "#05966940" : "#2a2a3a"}`,
                  borderRadius: 8, padding: "20px 24px",
                }}>
                  {/* Draft header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap" as const, gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "#555570" }}>#{i + 1}</span>
                      {scoreBadge(draft.score)}
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{draft.company_name}</div>
                        <div style={{ fontSize: 12, color: "#8888a0" }}>{draft.industry} · To: {draft.decision_maker}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {draft.contacted_at && (
                        <span style={{
                          fontSize: 11, fontFamily: "JetBrains Mono, monospace",
                          padding: "3px 10px", borderRadius: 4,
                          background: "#05966922", color: "#059669",
                        }}>
                          ✓ Contacted {new Date(draft.contacted_at).toLocaleDateString()}
                        </span>
                      )}
                      <form method="POST" action={`/api/crew-runs/${id}/drafts/${draft.id}${keyParam}`}>
                        <input type="hidden" name="key" value={key ?? ""} />
                        <input type="hidden" name="action" value={draft.contacted_at ? "uncontact" : "contact"} />
                        <button type="submit" style={{
                          padding: "5px 12px", borderRadius: 4, fontSize: 11,
                          fontFamily: "JetBrains Mono, monospace", fontWeight: 600,
                          cursor: "pointer", border: "1px solid #2a2a3a",
                          background: draft.contacted_at ? "#1a1a26" : "#2563eb",
                          color: draft.contacted_at ? "#8888a0" : "white",
                          textTransform: "uppercase" as const, letterSpacing: "0.5px",
                        }}>
                          {draft.contacted_at ? "Unmark" : "Mark Contacted"}
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Email */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, color: "#8888a0", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 6 }}>Email</div>
                    <div style={{ background: "#0a0a0f", border: "1px solid #2a2a3a", borderRadius: 6, padding: "12px 16px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#3b82f6", marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid #2a2a3a" }}>
                        Subject: {draft.subject_line}
                      </div>
                      <pre style={{ margin: 0, fontSize: 13, fontFamily: "DM Sans, sans-serif", whiteSpace: "pre-wrap", lineHeight: 1.7, color: "#c4c4d4" }}>
                        {draft.email_body}
                      </pre>
                    </div>
                  </div>

                  {/* LinkedIn */}
                  <div>
                    <div style={{ fontSize: 10, color: "#8888a0", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 6 }}>LinkedIn Message</div>
                    <div style={{ background: "#0a0a0f", border: "1px solid #2a2a3a", borderRadius: 6, padding: "12px 16px", fontSize: 13, color: "#c4c4d4", lineHeight: 1.7 }}>
                      {draft.linkedin_message}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
