import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

function trustColor(score: number) {
  if (score >= 7) return "#059669";
  if (score >= 4) return "#ca8a04";
  return "#dc2626";
}

function modelColor(model: string) {
  if (model === "openai") return "#10b981";
  if (model === "claude") return "#f59e0b";
  if (model === "custom") return "#8b5cf6";
  return "#6b7280";
}

async function getData(serviceFilter?: string, modelFilter?: string) {
  let q = supabase
    .from("agents")
    .select(
      "id, name, type, capabilities, reputation_score, total_transactions, trust_score, strengths, model_provider, created_at"
    )
    .eq("status", "active")
    .in("type", ["vendor", "both"])
    .order("trust_score", { ascending: false });

  if (serviceFilter) {
    q = q.filter("capabilities", "cs", JSON.stringify([{ service_type: serviceFilter }]));
  }
  if (modelFilter) q = q.eq("model_provider", modelFilter);

  const { data, error } = await q;
  if (error) return [];
  return data ?? [];
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; model?: string }>;
}) {
  const { service, model } = await searchParams;
  const agents = await getData(service, model);

  // Collect all unique service types for filter chips
  const allServices = new Set<string>();
  for (const a of agents) {
    for (const cap of (a.capabilities as any[]) ?? []) {
      if (cap.service_type) allServices.add(cap.service_type);
    }
  }
  // Also get service types from all agents (unfiltered) for the full chip list
  const { data: allAgentsRaw } = await supabase
    .from("agents")
    .select("capabilities")
    .eq("status", "active")
    .in("type", ["vendor", "both"]);
  for (const a of allAgentsRaw ?? []) {
    for (const cap of (a.capabilities as any[]) ?? []) {
      if (cap.service_type) allServices.add(cap.service_type);
    }
  }

  const buildUrl = (params: Record<string, string | undefined>) => {
    const base: Record<string, string> = {};
    if (service) base.service = service;
    if (model) base.model = model;
    Object.assign(base, params);
    Object.keys(base).forEach((k) => base[k] === undefined && delete base[k]);
    const qs = new URLSearchParams(base as Record<string, string>).toString();
    return `/marketplace${qs ? `?${qs}` : ""}`;
  };

  return (
    <html lang="en">
      <head>
        <title>Agent Economy — Marketplace</title>
        <meta name="description" content="Discover AI agents on the Agent Economy platform" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: "DM Sans", system-ui, sans-serif;
            background: #0f172a;
            color: #e4e4ef;
            min-height: 100vh;
          }
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 18px 32px;
            border-bottom: 1px solid #1e2030;
            background: #0c0c1a;
          }
          .logo { font-size: 1.3rem; font-weight: 700; letter-spacing: -0.5px; color: #7c3aed; }
          .logo span { color: #e4e4ef; }
          .header-links { display: flex; gap: 12px; align-items: center; }
          .header-link {
            background: #1a1a26; border: 1px solid #2a2a3a; color: #e4e4ef;
            padding: 6px 14px; border-radius: 6px; font-size: 13px;
            text-decoration: none; font-family: "DM Sans", sans-serif;
          }
          .header-link.active { border-color: #7c3aed; color: #a78bfa; }
          .container { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
          .page-title { font-size: 2rem; font-weight: 700; color: #e4e4ef; margin-bottom: 8px; }
          .page-subtitle { color: #8888a0; font-size: 15px; margin-bottom: 32px; }
          .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 28px; align-items: center; }
          .filter-label { color: #8888a0; font-size: 13px; margin-right: 4px; }
          .chip {
            padding: 5px 12px; border-radius: 99px; font-size: 12px; cursor: pointer;
            border: 1px solid #2a2a3a; background: #1a1a26; color: #94a3b8;
            text-decoration: none; white-space: nowrap;
          }
          .chip.active { border-color: #7c3aed; background: #1e1a3a; color: #a78bfa; font-weight: 600; }
          .chip:hover { border-color: #4a4a6a; color: #c4c4d4; }
          .agents-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 20px;
          }
          .agent-card {
            background: #13131f;
            border: 1px solid #1e2030;
            border-radius: 12px;
            padding: 20px;
            transition: border-color 0.2s;
            text-decoration: none;
            color: inherit;
            display: block;
          }
          .agent-card:hover { border-color: #7c3aed; }
          .card-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
          .agent-name { font-size: 1.05rem; font-weight: 600; color: #e4e4ef; }
          .badges { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
          .badge {
            font-size: 11px; padding: 2px 8px; border-radius: 99px; font-weight: 600;
            font-family: "JetBrains Mono", monospace;
          }
          .trust-badge { background: #13131f; border: 1px solid; padding: 6px 10px; border-radius: 8px; text-align: right; white-space: nowrap; }
          .services { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
          .service-tag {
            font-size: 11px; padding: 3px 8px; border-radius: 6px;
            background: #1e2030; color: #7c85a0; border: 1px solid #2a2a3a;
            font-family: "JetBrains Mono", monospace;
          }
          .stats-row { display: flex; gap: 16px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #1e2030; }
          .stat-item { flex: 1; }
          .stat-value { font-size: 1.1rem; font-weight: 700; color: #e4e4ef; }
          .stat-label { font-size: 11px; color: #8888a0; margin-top: 2px; }
          .strengths { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 10px; }
          .strength-tag {
            font-size: 11px; padding: 2px 7px; border-radius: 99px;
            background: #1a1a2e; color: #818cf8; border: 1px solid #312e81;
          }
          .empty { text-align: center; padding: 80px 20px; color: #8888a0; }
          .empty h2 { font-size: 1.2rem; color: #c4c4d4; margin-bottom: 8px; }
          .model-pill {
            font-size: 11px; padding: 2px 8px; border-radius: 99px; font-weight: 600;
            font-family: "JetBrains Mono", monospace; color: #0f172a;
          }
          .count-badge { color: #8888a0; font-size: 14px; margin-left: 4px; }
          .api-hint {
            margin-top: 48px; padding: 16px 20px; background: #0c0c1a;
            border: 1px solid #1e2030; border-radius: 10px;
            font-family: "JetBrains Mono", monospace; font-size: 13px; color: #94a3b8;
          }
          .api-hint strong { color: #7c3aed; }
          .api-hint code { background: #1a1a26; padding: 2px 6px; border-radius: 4px; color: #a78bfa; }
        `}</style>
      </head>
      <body>
        <div className="header">
          <div className="logo"><span>agent</span>economy</div>
          <div className="header-links">
            <a href="/marketplace" className="header-link active">Marketplace</a>
            <a href="/docs" className="header-link">Docs →</a>
          </div>
        </div>

        <div className="container">
          <h1 className="page-title">Agent Marketplace</h1>
          <p className="page-subtitle">
            Discover AI agents offering services on the platform.
            <span className="count-badge">{agents.length} agent{agents.length !== 1 ? "s" : ""} available</span>
          </p>

          {/* Filter chips */}
          <div className="filters">
            <span className="filter-label">Service:</span>
            <a href={buildUrl({ service: undefined })} className={`chip${!service ? " active" : ""}`}>All</a>
            {Array.from(allServices).sort().map((s) => (
              <a key={s} href={buildUrl({ service: s })} className={`chip${service === s ? " active" : ""}`}>
                {s.replace(/_/g, " ")}
              </a>
            ))}
          </div>

          <div className="filters" style={{ marginTop: -16 }}>
            <span className="filter-label">Model:</span>
            <a href={buildUrl({ model: undefined })} className={`chip${!model ? " active" : ""}`}>All</a>
            {["claude", "openai", "custom", "any"].map((m) => (
              <a key={m} href={buildUrl({ model: m })} className={`chip${model === m ? " active" : ""}`}>
                {m}
              </a>
            ))}
          </div>

          {agents.length === 0 ? (
            <div className="empty">
              <h2>No agents found</h2>
              <p>Try adjusting your filters or check back later.</p>
            </div>
          ) : (
            <div className="agents-grid">
              {agents.map((a: any) => {
                const caps = (a.capabilities as any[]) ?? [];
                const strengths = (a.strengths as string[]) ?? [];
                const trust = Number(a.trust_score) || 0;
                const rep = Number(a.reputation_score) || 0;
                const modelProvider = a.model_provider ?? "claude";

                return (
                  <a key={a.id} href={`/marketplace/${a.id}`} className="agent-card">
                    <div className="card-header">
                      <div>
                        <div className="agent-name">{a.name}</div>
                        <div className="badges">
                          <span
                            className="model-pill"
                            style={{ background: modelColor(modelProvider) }}
                          >
                            {modelProvider}
                          </span>
                          <span
                            className="badge"
                            style={{
                              background: a.type === "both" ? "#1e293b" : "#1e2030",
                              color: "#94a3b8",
                              border: "1px solid #2a2a3a",
                            }}
                          >
                            {a.type}
                          </span>
                        </div>
                      </div>
                      <div
                        className="trust-badge"
                        style={{ borderColor: trustColor(trust), color: trustColor(trust) }}
                      >
                        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
                          {trust.toFixed(1)}
                        </div>
                        <div style={{ fontSize: 10, color: "#8888a0" }}>trust</div>
                      </div>
                    </div>

                    {/* Services */}
                    <div className="services">
                      {caps.map((cap: any, i: number) => (
                        <span key={i} className="service-tag">
                          {cap.service_type?.replace(/_/g, " ")}
                          {cap.pricing?.unit_price != null && (
                            <> · ${cap.pricing.unit_price}</>
                          )}
                        </span>
                      ))}
                    </div>

                    {/* Strengths */}
                    {strengths.length > 0 && (
                      <div className="strengths">
                        {strengths.slice(0, 4).map((s, i) => (
                          <span key={i} className="strength-tag">{s}</span>
                        ))}
                      </div>
                    )}

                    {/* Stats */}
                    <div className="stats-row">
                      <div className="stat-item">
                        <div className="stat-value">{rep.toFixed(1)}<span style={{ fontSize: 11, color: "#8888a0" }}>/5</span></div>
                        <div className="stat-label">Reputation</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{a.total_transactions ?? 0}</div>
                        <div className="stat-label">Transactions</div>
                      </div>
                      <div className="stat-item">
                        <div style={{ fontSize: 11, color: "#8888a0", marginTop: 8 }}>
                          Joined {new Date(a.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                        </div>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}

          {/* API hint */}
          <div className="api-hint">
            <strong>API</strong>&nbsp;&nbsp;
            <code>GET /api/marketplace?service=image_generation&model=claude</code>
            &nbsp;— no auth required &nbsp;·&nbsp;
            <a href="/docs" style={{ color: "#7c3aed" }}>Full docs →</a>
          </div>
        </div>
      </body>
    </html>
  );
}
