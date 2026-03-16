import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

// Disable Next.js caching — always fetch live data on every request
export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function getData(opts: {
  statusFilter?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
}) {
  const PAGE_SIZE = 25;
  const page = Math.max(1, opts.page ?? 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const sortCol = ["created_at", "escrow_amount", "updated_at"].includes(opts.sortBy ?? "")
    ? opts.sortBy!
    : "created_at";
  const ascending = opts.sortDir === "asc";

  let convQuery = supabase
    .from("conversations")
    .select("*", { count: "exact" })
    .order(sortCol, { ascending })
    .range(from, to);

  if (opts.statusFilter && opts.statusFilter !== "all") {
    convQuery = convQuery.eq("status", opts.statusFilter);
  }

  const [agents, convResult, reviews, revenueResult, crewRunsResult, draftsSentResult] = await Promise.all([
    supabase.from("agents").select("*").order("created_at", { ascending: false }),
    convQuery,
    supabase.from("reviews").select("*"),
    supabase.from("platform_revenue").select("fee_amount, created_at"),
    supabase.from("crew_runs").select("*").order("created_at", { ascending: false }).limit(10),
    supabase.from("crew_run_drafts").select("id", { count: "exact", head: true }).not("contacted_at", "is", null),
  ]);

  const { data: episodeCounts } = await supabase
    .from("agent_episodes")
    .select("agent_id")
    .in("agent_id", (agents.data ?? []).map((a: any) => a.id));

  const episodeCountMap: Record<string, number> = {};
  for (const row of episodeCounts ?? []) {
    episodeCountMap[row.agent_id] = (episodeCountMap[row.agent_id] ?? 0) + 1;
  }

  const { data: threadCounts } = await supabase
    .from("agent_threads")
    .select("orchestrator_id")
    .in("orchestrator_id", (agents.data ?? []).map((a: any) => a.id));
  const threadCountMap: Record<string, number> = {};
  for (const row of threadCounts ?? []) {
    threadCountMap[row.orchestrator_id] = (threadCountMap[row.orchestrator_id] ?? 0) + 1;
  }

  return {
    agents: (agents.data ?? []).map((a: any) => ({
      ...a,
      episode_count: episodeCountMap[a.id] ?? 0,
      thread_count: threadCountMap[a.id] ?? 0,
    })),
    conversations: convResult.data ?? [],
    totalConversations: convResult.count ?? 0,
    reviews: reviews.data ?? [],
    revenue: revenueResult.data ?? [],
    crewRuns: crewRunsResult.data ?? [],
    draftsSent: draftsSentResult.count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  };
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    completed: "#059669",
    accepted: "#2563eb",
    delivered: "#7c3aed",
    rfq_sent: "#ca8a04",
    offer_sent: "#ea580c",
    disputed: "#dc2626",
    rejected: "#6b7280",
    expired: "#6b7280",
  };
  return map[status] ?? "#6b7280";
}

function AnalyticsChart({ revenue }: { revenue: any[] }) {
  const days: { label: string; txCount: number; fees: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayRevenue = revenue.filter((r: any) => r.created_at.slice(0, 10) === dateStr);
    days.push({
      label: dateStr.slice(5),
      txCount: dayRevenue.length,
      fees: dayRevenue.reduce((sum: number, r: any) => sum + Number(r.fee_amount), 0),
    });
  }

  const maxTx = Math.max(...days.map((d) => d.txCount), 1);
  const maxFees = Math.max(...days.map((d) => d.fees), 0.01);
  const W = 800, H = 140;
  const PAD = { top: 16, right: 16, bottom: 28, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const slotW = chartW / 14;
  const barW = slotW * 0.55;

  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #2a2a3a" }}>
        <div style={{ fontSize: 14, fontFamily: "JetBrains Mono, monospace", color: "#8888a0", textTransform: "uppercase", letterSpacing: "1.5px" }}>
          Activity — Last 14 Days
        </div>
        <div style={{ display: "flex", gap: 20, fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "#8888a0" }}>
          <span><span style={{ color: "#3b82f6" }}>■</span> Transactions</span>
          <span><span style={{ color: "#059669" }}>─</span> Fees ($)</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
        {/* Grid lines */}
        {[0, 0.5, 1].map((frac) => {
          const y = PAD.top + chartH * (1 - frac);
          return <line key={frac} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#2a2a3a" strokeWidth={1} />;
        })}
        {/* Bars */}
        {days.map((d, i) => {
          const barH = Math.max((d.txCount / maxTx) * chartH, d.txCount > 0 ? 2 : 0);
          const x = PAD.left + i * slotW + (slotW - barW) / 2;
          const y = PAD.top + chartH - barH;
          return <rect key={i} x={x} y={y} width={barW} height={barH} fill="#3b82f6" fillOpacity={0.35} rx={2} />;
        })}
        {/* Fee line */}
        {maxFees > 0.01 && (
          <polyline
            points={days.map((d, i) => {
              const x = PAD.left + i * slotW + slotW / 2;
              const y = PAD.top + chartH - (d.fees / maxFees) * chartH;
              return `${x},${y}`;
            }).join(" ")}
            fill="none" stroke="#059669" strokeWidth={1.5}
          />
        )}
        {/* Fee dots */}
        {days.map((d, i) => {
          if (d.fees === 0) return null;
          const x = PAD.left + i * slotW + slotW / 2;
          const y = PAD.top + chartH - (d.fees / maxFees) * chartH;
          return <circle key={i} cx={x} cy={y} r={2.5} fill="#059669" />;
        })}
        {/* X labels — every other day */}
        {days.map((d, i) => {
          if (i % 2 !== 0) return null;
          const x = PAD.left + i * slotW + slotW / 2;
          return (
            <text key={i} x={x} y={H - 6} textAnchor="middle" fontSize={9} fill="#555570" fontFamily="JetBrains Mono, monospace">
              {d.label}
            </text>
          );
        })}
        {/* Y labels */}
        <text x={PAD.left - 4} y={PAD.top + 4} textAnchor="end" fontSize={9} fill="#555570" fontFamily="JetBrains Mono, monospace">{maxTx}</text>
        <text x={PAD.left - 4} y={PAD.top + chartH / 2 + 4} textAnchor="end" fontSize={9} fill="#555570" fontFamily="JetBrains Mono, monospace">{Math.round(maxTx / 2)}</text>
        <text x={PAD.left - 4} y={PAD.top + chartH} textAnchor="end" fontSize={9} fill="#555570" fontFamily="JetBrains Mono, monospace">0</text>
      </svg>
    </div>
  );
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; status?: string; sort?: string; dir?: string; page?: string }>;
}) {
  const { key, status, sort, dir, page } = await searchParams;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminPassword && key !== adminPassword) {
    return (
      <html lang="en">
        <head><title>Agent Economy — Access Denied</title></head>
        <body style={{ fontFamily: "system-ui", display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", margin: 0, background: "#0f172a", color: "#94a3b8" }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "1.5rem", color: "#e2e8f0" }}>🔒 Admin Dashboard</h1>
            <p>Access denied. Append <code>?key=YOUR_PASSWORD</code> to the URL.</p>
          </div>
        </body>
      </html>
    );
  }

  const currentPage = parseInt(page ?? "1", 10);
  const { agents, conversations, totalConversations, reviews, revenue, crewRuns, draftsSent, pageSize } = await getData({
    statusFilter: status,
    sortBy: sort,
    sortDir: dir,
    page: currentPage,
  });

  const totalPages = Math.ceil(totalConversations / pageSize);

  // Stats computed from current page + revenue table for accurate totals
  const totalFees = revenue.reduce((sum: number, r: any) => sum + Number(r.fee_amount), 0);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const mrr = revenue
    .filter((r: any) => new Date(r.created_at) >= startOfMonth)
    .reduce((sum: number, r: any) => sum + Number(r.fee_amount), 0);

  const completedTx = conversations.filter((c: any) => c.status === "completed");
  const totalEscrow = completedTx.reduce((sum: number, c: any) => sum + (Number(c.escrow_amount) || 0), 0);
  const activeTx = conversations.filter((c: any) =>
    ["rfq_sent", "offer_sent", "accepted", "delivered"].includes(c.status)
  );
  const disputedTx = conversations.filter(
    (c: any) =>
      c.status === "disputed" ||
      (c.status === "expired" && c.escrow_frozen && Number(c.escrow_amount) > 0)
  );

  // Build URL helper for sort/filter links
  const buildUrl = (params: Record<string, string | undefined>) => {
    const base: Record<string, string> = { key: key ?? "" };
    if (status) base.status = status;
    if (sort) base.sort = sort;
    if (dir) base.dir = dir;
    Object.assign(base, params);
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(base).filter(([, v]) => v))
    ).toString();
    return `/?${qs}`;
  };

  const sortLink = (col: string) => {
    const newDir = sort === col && dir === "asc" ? "desc" : "asc";
    return buildUrl({ sort: col, dir: newDir, page: "1" });
  };

  const sortArrow = (col: string) =>
    sort === col ? (dir === "asc" ? " ↑" : " ↓") : "";

  return (
    <html lang="en">
      <head>
        <title>Agent Economy — Admin</title>
        <script dangerouslySetInnerHTML={{ __html: `
          window.__refreshedAt = new Date().toLocaleTimeString();
          window.onload = function() {
            var el = document.getElementById('last-refreshed');
            if (el) el.textContent = 'Last updated: ' + window.__refreshedAt;
          };
        ` }} />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          :root {
            --bg: #0a0a0f;
            --surface: #12121a;
            --surface2: #1a1a26;
            --border: #2a2a3a;
            --text: #e4e4ef;
            --text2: #8888a0;
            --accent: #3b82f6;
            --green: #059669;
            --red: #dc2626;
            --orange: #ea580c;
          }
          body {
            font-family: 'DM Sans', sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
          }
          .header {
            padding: 24px 40px;
            border-bottom: 1px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .logo {
            font-family: 'JetBrains Mono', monospace;
            font-size: 18px;
            font-weight: 700;
            letter-spacing: -0.5px;
          }
          .logo span { color: var(--accent); }
          .badge {
            font-size: 11px;
            font-family: 'JetBrains Mono', monospace;
            padding: 4px 10px;
            border-radius: 4px;
            background: #059669;
            color: white;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .main { padding: 32px 40px; max-width: 1400px; }
          .stats {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 16px;
            margin-bottom: 40px;
          }
          .stat {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 20px;
          }
          .stat-label {
            font-size: 12px;
            color: var(--text2);
            text-transform: uppercase;
            letter-spacing: 1px;
            font-family: 'JetBrains Mono', monospace;
            margin-bottom: 8px;
          }
          .stat-value {
            font-size: 28px;
            font-weight: 700;
            font-family: 'JetBrains Mono', monospace;
          }
          .stat-value.green { color: var(--green); }
          .stat-value.accent { color: var(--accent); }
          .stat-value.orange { color: var(--orange); }
          .stat-value.red { color: var(--red); }
          .section {
            margin-bottom: 40px;
          }
          .section-title {
            font-size: 14px;
            font-family: 'JetBrains Mono', monospace;
            color: var(--text2);
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--border);
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
          }
          th {
            text-align: left;
            padding: 10px 16px;
            font-size: 11px;
            font-family: 'JetBrains Mono', monospace;
            color: var(--text2);
            text-transform: uppercase;
            letter-spacing: 1px;
            border-bottom: 1px solid var(--border);
          }
          td {
            padding: 12px 16px;
            border-bottom: 1px solid var(--border);
          }
          tr:hover td { background: var(--surface2); }
          .mono {
            font-family: 'JetBrains Mono', monospace;
            font-size: 13px;
          }
          .status-pill {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            font-family: 'JetBrains Mono', monospace;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .type-pill {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-family: 'JetBrains Mono', monospace;
            border: 1px solid var(--border);
            color: var(--text2);
          }
          .uuid {
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            color: var(--text2);
          }
          a.conv-link {
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            color: var(--accent);
            text-decoration: none;
            border-bottom: 1px dashed var(--accent);
          }
          a.conv-link:hover { opacity: 0.75; }
          .amount {
            font-family: 'JetBrains Mono', monospace;
            font-weight: 600;
          }
          .btn-resolve {
            display: inline-block;
            padding: 5px 12px;
            border-radius: 4px;
            font-size: 11px;
            font-family: 'JetBrains Mono', monospace;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            cursor: pointer;
            border: none;
            margin-right: 6px;
          }
          .btn-release { background: #059669; color: white; }
          .btn-release:hover { background: #047857; }
          .btn-refund { background: #2563eb; color: white; }
          .btn-refund:hover { background: #1d4ed8; }
        `}</style>
      </head>
      <body>
        <div className="header">
          <div className="logo">
            <span>agent</span>economy
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span id="last-refreshed" style={{ fontSize: 12, color: "#8888a0", fontFamily: "JetBrains Mono, monospace" }}></span>
            <a
              href={key ? `/?key=${key}` : "/"}
              style={{ background: "#1a1a26", border: "1px solid #2a2a3a", color: "#e4e4ef", padding: "6px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: "DM Sans, sans-serif", textDecoration: "none" }}
            >↻ Refresh</a>
            <div className="badge">Admin Dashboard</div>
          </div>
        </div>

        <div className="main">
          {/* Stats */}
          <div className="stats">
            <div className="stat">
              <div className="stat-label">Registered Agents</div>
              <div className="stat-value accent">{agents.length}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Total Transactions</div>
              <div className="stat-value green">{totalConversations}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Active</div>
              <div className="stat-value orange">{activeTx.length}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Disputes</div>
              <div className="stat-value red">{disputedTx.length}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Total Fees Earned</div>
              <div className="stat-value green">${totalFees.toFixed(2)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Fees This Month</div>
              <div className="stat-value accent">${mrr.toFixed(2)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Drafts Sent</div>
              <div className="stat-value" style={{ color: "#8b5cf6" }}>{draftsSent}</div>
            </div>
          </div>

          {/* Analytics Chart */}
          <AnalyticsChart revenue={revenue} />

          {/* Agents */}
          <div className="section">
            <div className="section-title">Registered Agents</div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Balance</th>
                  <th>Reputation</th>
                  <th>Transactions</th>
                  <th>Episodes</th>
                  <th>Threads</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a: any) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                    <td>
                      <span className="type-pill">{a.type}</span>
                    </td>
                    <td className="amount" style={{ color: a.balance > 0 ? "#059669" : "#8888a0" }}>
                      ${Number(a.balance).toFixed(2)}
                    </td>
                    <td className="mono">
                      {Number(a.reputation_score).toFixed(1)} / 5.0
                    </td>
                    <td className="mono">{a.total_transactions}</td>
                    <td className="mono" style={{ color: a.episode_count > 0 ? "#8b5cf6" : "#8888a0" }}>
                      {a.episode_count}
                    </td>
                    <td className="mono" style={{ color: a.thread_count > 0 ? "#8b5cf6" : "#8888a0" }}>
                      {a.thread_count}
                    </td>
                    <td>
                      <span className="type-pill" style={{
                        borderColor: a.agent_role === "orchestrator" ? "#8b5cf6" : a.agent_role === "worker" ? "#ea580c" : "#2a2a3a",
                        color: a.agent_role === "orchestrator" ? "#8b5cf6" : a.agent_role === "worker" ? "#ea580c" : "#8888a0",
                      }}>
                        {a.agent_role ?? "standalone"}
                      </span>
                    </td>
                    <td>
                      <span
                        className="status-pill"
                        style={{
                          background: a.status === "active" ? "#059669" + "22" : "#dc2626" + "22",
                          color: a.status === "active" ? "#059669" : "#dc2626",
                        }}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="uuid">{a.id.slice(0, 8)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Crew Runs */}
          <div className="section">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid #2a2a3a" }}>
              <div className="section-title" style={{ margin: 0, border: 0, padding: 0 }}>Crew Runs</div>
              <form action="/api/crew-runs" method="POST" style={{ display: "flex", gap: 8 }}>
                <input type="hidden" name="key" value={key ?? ""} />
                <input
                  type="text"
                  name="query"
                  placeholder="e.g. healthcare companies in India that need AI automation"
                  style={{
                    width: 380, padding: "6px 12px", borderRadius: 6,
                    border: "1px solid #2a2a3a", background: "#12121a",
                    color: "#e4e4ef", fontSize: 13, fontFamily: "DM Sans, sans-serif",
                  }}
                />
                <button type="submit" style={{
                  padding: "6px 14px", borderRadius: 6, fontSize: 12,
                  fontFamily: "JetBrains Mono, monospace", fontWeight: 600,
                  background: "#8b5cf6", color: "white", border: "none", cursor: "pointer",
                  textTransform: "uppercase", letterSpacing: "0.5px",
                }}>
                  + New Run
                </button>
              </form>
            </div>
            {crewRuns.length === 0 ? (
              <div style={{ color: "#8888a0", fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>No crew runs yet.</div>
            ) : (
            <table>
                <thead>
                  <tr>
                    <th>Run ID</th>
                    <th>Query</th>
                    <th>Status</th>
                    <th>Companies</th>
                    <th>Leads</th>
                    <th>Drafts</th>
                    <th>Started</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {crewRuns.map((r: any) => {
                    const durationMs = r.completed_at
                      ? new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()
                      : null;
                    const durationStr = durationMs !== null
                      ? `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`
                      : "—";
                    const statusColor =
                      r.status === "completed" ? "#059669" :
                      r.status === "running" ? "#ea580c" : "#dc2626";
                    return (
                      <tr key={r.id}>
                        <td>
                          <a
                            className="conv-link"
                            href={`/crew-runs/${r.id}${key ? `?key=${key}` : ""}`}
                          >
                            {r.id.slice(0, 8)}…
                          </a>
                        </td>
                        <td style={{ color: "#8888a0", fontSize: 12, maxWidth: 240 }}>
                          {String(r.query).slice(0, 50)}{r.query.length > 50 ? "…" : ""}
                        </td>
                        <td>
                          <span
                            className="status-pill"
                            style={{ background: statusColor + "22", color: statusColor }}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="mono">{r.company_count ?? "—"}</td>
                        <td className="mono">{r.lead_count ?? "—"}</td>
                        <td className="mono" style={{ color: r.draft_count ? "#8b5cf6" : "#8888a0" }}>
                          {r.draft_count ?? "—"}
                        </td>
                        <td className="mono" style={{ color: "#8888a0", fontSize: 12 }}>
                          {new Date(r.started_at).toLocaleString()}
                        </td>
                        <td className="mono" style={{ color: "#8888a0", fontSize: 12 }}>
                          {durationStr}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Conversations */}
          <div className="section">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid #2a2a3a" }}>
              <div className="section-title" style={{ margin: 0, border: 0, padding: 0 }}>
                Conversations / Transactions
                <span style={{ fontSize: 12, color: "#8888a0", marginLeft: 8 }}>({totalConversations} total)</span>
              </div>
              {/* Status filter */}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {["all", "rfq_sent", "offer_sent", "accepted", "delivered", "completed", "disputed", "rejected", "expired"].map((s) => (
                  <a
                    key={s}
                    href={buildUrl({ status: s === "all" ? undefined : s, page: "1" })}
                    style={{
                      fontSize: 11, fontFamily: "JetBrains Mono, monospace",
                      padding: "3px 10px", borderRadius: 4, textDecoration: "none",
                      background: (status ?? "all") === s ? "#3b82f6" : "#1a1a26",
                      color: (status ?? "all") === s ? "white" : "#8888a0",
                      border: "1px solid #2a2a3a",
                    }}
                  >{s}</a>
                ))}
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Service</th>
                  <th>Query / Notes</th>
                  <th>Buyer</th>
                  <th>Vendor</th>
                  <th>Status</th>
                  <th>
                    <a href={sortLink("escrow_amount")} style={{ color: "inherit", textDecoration: "none" }}>
                      Escrow{sortArrow("escrow_amount")}
                    </a>
                  </th>
                  <th>Fee</th>
                  <th>
                    <a href={sortLink("created_at")} style={{ color: "inherit", textDecoration: "none" }}>
                      Created{sortArrow("created_at")}
                    </a>
                  </th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((c: any) => {
                  const buyer = agents.find((a: any) => a.id === c.buyer_id);
                  const vendor = agents.find((a: any) => a.id === c.vendor_id);
                  return (
                    <tr key={c.id}>
                      <td>
                        <a className="conv-link" href={`/conversations/${c.id}`} target="_blank">
                          {c.id.slice(0, 8)}…
                        </a>
                      </td>
                      <td className="mono">{c.service_type}</td>
                      <td style={{ color: "#8888a0", fontSize: 12, maxWidth: 200 }}>
                        {c.rfq_payload?.query
                          ? `"${String(c.rfq_payload.query).slice(0, 45)}${c.rfq_payload.query.length > 45 ? "…" : ""}"`
                          : "—"}
                      </td>
                      <td>{buyer?.name ?? c.buyer_id.slice(0, 8)}</td>
                      <td>{vendor?.name ?? c.vendor_id.slice(0, 8)}</td>
                      <td>
                        <span
                          className="status-pill"
                          style={{
                            background: statusColor(c.status) + "22",
                            color: statusColor(c.status),
                          }}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="amount">
                        {c.escrow_amount ? `$${Number(c.escrow_amount).toFixed(2)}` : "—"}
                      </td>
                      <td className="amount" style={{ color: "#059669" }}>
                        {c.platform_fee ? `$${Number(c.platform_fee).toFixed(2)}` : "—"}
                      </td>
                      <td className="mono" style={{ color: "#8888a0", fontSize: 12 }}>
                        {new Date(c.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                <span style={{ fontSize: 12, color: "#8888a0", fontFamily: "JetBrains Mono, monospace" }}>
                  Page {currentPage} of {totalPages}
                </span>
                {currentPage > 1 && (
                  <a href={buildUrl({ page: String(currentPage - 1) })} style={{
                    fontSize: 12, fontFamily: "JetBrains Mono, monospace",
                    padding: "4px 12px", borderRadius: 4, textDecoration: "none",
                    background: "#1a1a26", color: "#e4e4ef", border: "1px solid #2a2a3a",
                  }}>← Prev</a>
                )}
                {currentPage < totalPages && (
                  <a href={buildUrl({ page: String(currentPage + 1) })} style={{
                    fontSize: 12, fontFamily: "JetBrains Mono, monospace",
                    padding: "4px 12px", borderRadius: 4, textDecoration: "none",
                    background: "#1a1a26", color: "#e4e4ef", border: "1px solid #2a2a3a",
                  }}>Next →</a>
                )}
              </div>
            )}
          </div>

          {/* Disputes */}
          {disputedTx.length > 0 && (
            <div className="section">
              <div className="section-title" style={{ color: "#dc2626" }}>
                Disputed / Frozen Transactions
              </div>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Service</th>
                    <th>Status</th>
                    <th>Escrow Locked</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {disputedTx.map((c: any) => (
                    <tr key={c.id}>
                      <td>
                        <a className="conv-link" href={`/conversations/${c.id}`} target="_blank">
                          {c.id.slice(0, 8)}…
                        </a>
                      </td>
                      <td className="mono">{c.service_type}</td>
                      <td>
                        <span
                          className="status-pill"
                          style={{
                            background: c.status === "disputed" ? "#dc262620" : "#6b728020",
                            color: c.status === "disputed" ? "#dc2626" : "#6b7280",
                          }}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="amount" style={{ color: "#dc2626" }}>
                        ${Number(c.escrow_amount).toFixed(2)}
                      </td>
                      <td className="mono" style={{ color: "#8888a0", fontSize: 12 }}>
                        {new Date(c.created_at).toLocaleString()}
                      </td>
                      <td>
                        <form
                          action={`/api/admin/disputes/${c.id}`}
                          method="POST"
                          style={{ display: "inline" }}
                        >
                          <input type="hidden" name="action" value="release" />
                          <input type="hidden" name="key" value={key ?? ""} />
                          <button type="submit" className="btn-resolve btn-release">
                            Release to Vendor
                          </button>
                        </form>
                        <form
                          action={`/api/admin/disputes/${c.id}`}
                          method="POST"
                          style={{ display: "inline" }}
                        >
                          <input type="hidden" name="action" value="refund" />
                          <input type="hidden" name="key" value={key ?? ""} />
                          <button type="submit" className="btn-resolve btn-refund">
                            Refund to Buyer
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
