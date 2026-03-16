import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import type { CrewRun, CrewDraft, PipelineStatus } from "@/lib/crew-runs";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const STAGES: { value: PipelineStatus; label: string; color: string }[] = [
  { value: "new",        label: "New",        color: "#8888a0" },
  { value: "contacted",  label: "Contacted",  color: "#2563eb" },
  { value: "replied",    label: "Replied",    color: "#7c3aed" },
  { value: "interested", label: "Interested", color: "#059669" },
  { value: "closed",     label: "Closed",     color: "#ca8a04" },
  { value: "skipped",    label: "Skipped",    color: "#374151" },
];

function stageColor(s: PipelineStatus) {
  return STAGES.find((x) => x.value === s)?.color ?? "#8888a0";
}

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

function runStatusPill(status: string) {
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
  const dur = duration(run as CrewRun);

  return (
    <html lang="en">
      <head>
        <title>Crew Run {id.slice(0, 8)} — Agent Economy</title>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'DM Sans', sans-serif; background: #0a0a0f; color: #e4e4ef; min-height: 100vh; }
          select, input[type="text"], input[type="date"], textarea {
            background: #12121a; border: 1px solid #2a2a3a; color: #e4e4ef;
            border-radius: 4px; font-family: 'DM Sans', sans-serif; font-size: 13px;
          }
          select:focus, input:focus, textarea:focus { outline: 1px solid #3b82f6; }
        `}</style>
      </head>
      <body>
        {/* Header */}
        <div style={{ padding: "20px 40px", borderBottom: "1px solid #2a2a3a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 18, fontWeight: 700 }}>
            <span style={{ color: "#3b82f6" }}>agent</span>economy
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <a href={`/pipeline${keyParam}`} style={{ color: "#8b5cf6", fontSize: 14, textDecoration: "none" }}>Pipeline →</a>
            <a href={`/${keyParam}`} style={{ color: "#8888a0", fontSize: 14, textDecoration: "none" }}>← Dashboard</a>
          </div>
        </div>

        <div style={{ padding: "32px 40px", maxWidth: 960 }}>
          {/* Run header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <h1 style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 20, fontWeight: 700, margin: 0 }}>Crew Run</h1>
              {runStatusPill(run.status)}
            </div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "#555570", marginBottom: 12 }}>{id}</div>
            <div style={{ background: "#12121a", border: "1px solid #2a2a3a", borderRadius: 8, padding: "12px 16px", fontSize: 14, marginBottom: 16 }}>
              <span style={{ color: "#8888a0", fontSize: 11, fontFamily: "JetBrains Mono, monospace", marginRight: 8, textTransform: "uppercase", letterSpacing: 1 }}>Query</span>
              <strong>{run.query}</strong>
            </div>
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
            <a href={exportUrl} style={{ display: "inline-block", padding: "7px 16px", borderRadius: 6, fontSize: 12, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, background: "#059669", color: "white", textDecoration: "none" }}>
              ↓ Export CSV
            </a>
          </div>

          {/* Drafts */}
          {(drafts ?? []).length === 0 ? (
            <div style={{ color: "#8888a0", fontSize: 14 }}>No drafts yet — run may still be in progress.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {(drafts as CrewDraft[]).map((draft, i) => {
                const stage = draft.pipeline_status ?? "new";
                const sc = stageColor(stage as PipelineStatus);
                const draftAction = `/api/crew-runs/${id}/drafts/${draft.id}${keyParam}`;

                return (
                  <div key={draft.id} style={{
                    background: "#12121a",
                    border: `1px solid ${stage === "new" ? "#2a2a3a" : sc + "40"}`,
                    borderRadius: 8, padding: "20px 24px",
                  }}>
                    {/* Header row */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" as const }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "#555570" }}>#{i + 1}</span>
                        {scoreBadge(draft.score)}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{draft.company_name}</div>
                          <div style={{ fontSize: 12, color: "#8888a0" }}>{draft.industry} · To: {draft.decision_maker}</div>
                        </div>
                      </div>

                      {/* Stage selector */}
                      <form method="POST" action={draftAction} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="hidden" name="key" value={key ?? ""} />
                        <input type="hidden" name="action" value="pipeline" />
                        <select
                          name="pipeline_status"
                          defaultValue={stage}
                          onChange={(e) => (e.target.form as HTMLFormElement)?.submit()}
                          style={{
                            padding: "5px 10px", borderRadius: 4, fontSize: 12,
                            fontFamily: "JetBrains Mono, monospace", cursor: "pointer",
                            color: sc, borderColor: sc + "60",
                          }}
                        >
                          {STAGES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        <button type="submit" style={{
                          padding: "5px 10px", borderRadius: 4, fontSize: 11,
                          fontFamily: "JetBrains Mono, monospace", fontWeight: 600,
                          cursor: "pointer", border: "1px solid #2a2a3a",
                          background: "#1a1a26", color: "#8888a0",
                          textTransform: "uppercase" as const, letterSpacing: "0.5px",
                        }}>Save</button>
                      </form>
                    </div>

                    {/* Notes + follow-up row */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, marginBottom: 16 }}>
                      <form method="POST" action={draftAction} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                        <input type="hidden" name="key" value={key ?? ""} />
                        <input type="hidden" name="action" value="notes" />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: "#8888a0", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 4 }}>Notes</div>
                          <textarea
                            name="notes"
                            defaultValue={draft.notes ?? ""}
                            rows={2}
                            placeholder="Add notes..."
                            style={{ width: "100%", padding: "6px 10px", resize: "vertical" }}
                          />
                        </div>
                        <button type="submit" style={{ padding: "6px 12px", borderRadius: 4, fontSize: 11, fontFamily: "JetBrains Mono, monospace", cursor: "pointer", border: "1px solid #2a2a3a", background: "#1a1a26", color: "#8888a0" }}>Save</button>
                      </form>

                      <form method="POST" action={draftAction} style={{ display: "flex", flexDirection: "column" as const, gap: 4, justifyContent: "flex-end" }}>
                        <input type="hidden" name="key" value={key ?? ""} />
                        <input type="hidden" name="action" value="follow_up" />
                        <div style={{ fontSize: 10, color: "#8888a0", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 4 }}>Follow-up Date</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            type="date"
                            name="follow_up_date"
                            defaultValue={draft.follow_up_date ?? ""}
                            style={{ padding: "6px 10px" }}
                          />
                          <button type="submit" style={{ padding: "6px 12px", borderRadius: 4, fontSize: 11, fontFamily: "JetBrains Mono, monospace", cursor: "pointer", border: "1px solid #2a2a3a", background: "#1a1a26", color: "#8888a0" }}>Set</button>
                        </div>
                      </form>
                    </div>

                    {/* Email */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, color: "#8888a0", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 6 }}>Email</div>
                      <div style={{ background: "#0a0a0f", border: "1px solid #2a2a3a", borderRadius: 6, padding: "12px 16px" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#3b82f6", marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid #2a2a3a" }}>
                          Subject: {draft.subject_line}
                        </div>
                        <pre style={{ margin: 0, fontSize: 13, fontFamily: "DM Sans, sans-serif", whiteSpace: "pre-wrap", lineHeight: 1.7, color: "#c4c4d4" }}>{draft.email_body}</pre>
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
                );
              })}
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
