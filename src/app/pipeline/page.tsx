import { createClient } from "@supabase/supabase-js";
import type { PipelineStatus } from "@/lib/crew-runs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const STAGES: { value: PipelineStatus | "all"; label: string; color: string }[] = [
  { value: "all",        label: "All",        color: "#8888a0" },
  { value: "new",        label: "New",        color: "#8888a0" },
  { value: "contacted",  label: "Contacted",  color: "#2563eb" },
  { value: "replied",    label: "Replied",    color: "#7c3aed" },
  { value: "interested", label: "Interested", color: "#059669" },
  { value: "closed",     label: "Closed",     color: "#ca8a04" },
  { value: "skipped",    label: "Skipped",    color: "#374151" },
];

function stageColor(s: string) {
  return STAGES.find((x) => x.value === s)?.color ?? "#8888a0";
}

function scoreBadge(score: number | null) {
  const s = score ?? 0;
  const bg = s >= 9 ? "#05966922" : s >= 7 ? "#3b82f622" : "#ca8a0422";
  const color = s >= 9 ? "#059669" : s >= 7 ? "#3b82f6" : "#ca8a04";
  return (
    <span style={{
      fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 700,
      padding: "2px 7px", borderRadius: 4, background: bg, color,
    }}>
      {s}/10
    </span>
  );
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; stage?: string }>;
}) {
  const { key, stage } = await searchParams;

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

  const activeStage = (stage ?? "all") as PipelineStatus | "all";
  const keyParam = key ? `?key=${encodeURIComponent(key)}` : "";

  // Fetch all drafts with their run query
  let q = supabase
    .from("crew_run_drafts")
    .select("*, crew_runs(id, query)")
    .order("score", { ascending: false })
    .limit(500);

  if (activeStage !== "all") {
    q = q.eq("pipeline_status", activeStage);
  }

  const { data: drafts } = await q;
  const allDrafts = (drafts ?? []) as any[];

  // Stage counts (always from full dataset for the tabs)
  const { data: counts } = await supabase
    .from("crew_run_drafts")
    .select("pipeline_status");

  const countMap: Record<string, number> = { all: 0 };
  for (const row of counts ?? []) {
    const s = row.pipeline_status ?? "new";
    countMap[s] = (countMap[s] ?? 0) + 1;
    countMap.all = (countMap.all ?? 0) + 1;
  }

  const buildUrl = (s: string) => {
    const params = new URLSearchParams();
    if (key) params.set("key", key);
    if (s !== "all") params.set("stage", s);
    const qs = params.toString();
    return `/pipeline${qs ? `?${qs}` : ""}`;
  };

  return (
    <html lang="en">
      <head>
        <title>Pipeline — Agent Economy</title>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'DM Sans', sans-serif; background: #0a0a0f; color: #e4e4ef; min-height: 100vh; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { text-align: left; padding: 10px 14px; font-size: 10px; font-family: 'JetBrains Mono', monospace; color: #8888a0; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #2a2a3a; }
          td { padding: 12px 14px; border-bottom: 1px solid #1a1a26; vertical-align: top; }
          tr:hover td { background: #12121a; }
          select, input[type="date"] { background: #12121a; border: 1px solid #2a2a3a; color: #e4e4ef; border-radius: 4px; font-size: 12px; padding: 4px 8px; font-family: 'JetBrains Mono', monospace; }
          select:focus, input:focus { outline: 1px solid #3b82f6; }
          .tab { display: inline-block; padding: 5px 14px; border-radius: 4px; font-size: 11px; font-family: 'JetBrains Mono', monospace; text-decoration: none; border: 1px solid #2a2a3a; cursor: pointer; }
        `}</style>
      </head>
      <body>
        {/* Header */}
        <div style={{ padding: "20px 40px", borderBottom: "1px solid #2a2a3a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 18, fontWeight: 700 }}>
            <span style={{ color: "#3b82f6" }}>agent</span>economy
            <span style={{ color: "#8888a0", fontSize: 14, fontWeight: 400, marginLeft: 12 }}>/ pipeline</span>
          </div>
          <a href={`/${keyParam}`} style={{ color: "#8888a0", fontSize: 14, textDecoration: "none" }}>← Dashboard</a>
        </div>

        <div style={{ padding: "32px 40px" }}>

          {/* Stage summary cards */}
          <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" as const }}>
            {STAGES.filter((s) => s.value !== "all").map((s) => (
              <a key={s.value} href={buildUrl(s.value)} style={{ textDecoration: "none" }}>
                <div style={{
                  background: activeStage === s.value ? s.color + "22" : "#12121a",
                  border: `1px solid ${activeStage === s.value ? s.color + "60" : "#2a2a3a"}`,
                  borderRadius: 8, padding: "14px 20px", minWidth: 100, cursor: "pointer",
                }}>
                  <div style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: s.color, textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: s.color }}>{countMap[s.value] ?? 0}</div>
                </div>
              </a>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" as const }}>
            {STAGES.map((s) => (
              <a
                key={s.value}
                href={buildUrl(s.value)}
                className="tab"
                style={{
                  background: activeStage === s.value ? s.color : "#12121a",
                  color: activeStage === s.value ? "white" : "#8888a0",
                  borderColor: activeStage === s.value ? s.color : "#2a2a3a",
                }}
              >
                {s.label} {countMap[s.value] !== undefined ? `(${countMap[s.value]})` : ""}
              </a>
            ))}
          </div>

          {/* Leads table */}
          {allDrafts.length === 0 ? (
            <div style={{ color: "#8888a0", fontSize: 14, fontFamily: "JetBrains Mono, monospace" }}>
              No leads in this stage.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Company</th>
                  <th>Decision Maker</th>
                  <th>Stage</th>
                  <th>Follow-up</th>
                  <th>Notes</th>
                  <th>Run</th>
                </tr>
              </thead>
              <tbody>
                {allDrafts.map((draft: any) => {
                  const sc = stageColor(draft.pipeline_status ?? "new");
                  const runId = draft.crew_runs?.id ?? draft.crew_run_id;
                  const runQuery = draft.crew_runs?.query ?? "";
                  const draftAction = `/api/crew-runs/${runId}/drafts/${draft.id}${keyParam}`;

                  return (
                    <tr key={draft.id}>
                      <td>{scoreBadge(draft.score)}</td>
                      <td>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>{draft.company_name}</div>
                        <div style={{ fontSize: 11, color: "#8888a0" }}>{draft.industry}</div>
                      </td>
                      <td style={{ fontSize: 12, color: "#c4c4d4" }}>{draft.decision_maker ?? "—"}</td>
                      <td>
                        <form method="POST" action={draftAction} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input type="hidden" name="key" value={key ?? ""} />
                          <input type="hidden" name="action" value="pipeline" />
                          <select
                            name="pipeline_status"
                            defaultValue={draft.pipeline_status ?? "new"}
                            style={{ color: sc, borderColor: sc + "60" }}
                          >
                            {STAGES.filter((s) => s.value !== "all").map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                          <button type="submit" style={{
                            padding: "4px 8px", borderRadius: 3, fontSize: 10,
                            fontFamily: "JetBrains Mono, monospace", cursor: "pointer",
                            border: "1px solid #2a2a3a", background: "#1a1a26", color: "#8888a0",
                          }}>→</button>
                        </form>
                        {draft.contacted_at && (
                          <div style={{ fontSize: 10, color: "#8888a0", fontFamily: "JetBrains Mono, monospace", marginTop: 4 }}>
                            First contact: {new Date(draft.contacted_at).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td>
                        <form method="POST" action={draftAction} style={{ display: "flex", gap: 4 }}>
                          <input type="hidden" name="key" value={key ?? ""} />
                          <input type="hidden" name="action" value="follow_up" />
                          <input
                            type="date"
                            name="follow_up_date"
                            defaultValue={draft.follow_up_date ?? ""}
                            style={{ fontSize: 11 }}
                          />
                          <button type="submit" style={{
                            padding: "4px 8px", borderRadius: 3, fontSize: 10,
                            fontFamily: "JetBrains Mono, monospace", cursor: "pointer",
                            border: "1px solid #2a2a3a", background: "#1a1a26", color: "#8888a0",
                          }}>Set</button>
                        </form>
                      </td>
                      <td style={{ maxWidth: 200 }}>
                        <div style={{ fontSize: 12, color: "#c4c4d4", marginBottom: 4 }}>{draft.notes ?? <span style={{ color: "#555570" }}>—</span>}</div>
                      </td>
                      <td>
                        <a
                          href={`/crew-runs/${runId}${keyParam}`}
                          style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#3b82f6", textDecoration: "none", borderBottom: "1px dashed #3b82f6" }}
                        >
                          {runId?.slice(0, 8)}…
                        </a>
                        {runQuery && (
                          <div style={{ fontSize: 10, color: "#555570", marginTop: 2, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {runQuery}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </body>
    </html>
  );
}
