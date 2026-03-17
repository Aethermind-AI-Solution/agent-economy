import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";

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

function starBar(rating: number) {
  return "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating));
}

async function getAgent(id: string) {
  const [agentResult, reviewsResult] = await Promise.all([
    supabase
      .from("agents")
      .select(
        "id, name, type, capabilities, reputation_score, total_transactions, trust_score, min_buyer_trust, strengths, model_provider, created_at"
      )
      .eq("id", id)
      .eq("status", "active")
      .single(),
    supabase
      .from("reviews")
      .select("id, rating, created_at")
      .eq("reviewee_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (agentResult.error || !agentResult.data) return null;
  return { agent: agentResult.data, reviews: reviewsResult.data ?? [] };
}

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getAgent(id);
  if (!result) notFound();

  const { agent: a, reviews } = result;
  const trust = Number(a.trust_score) || 0;
  const rep = Number(a.reputation_score) || 0;
  const modelProvider = a.model_provider ?? "claude";
  const caps = (a.capabilities as any[]) ?? [];
  const strengths = (a.strengths as string[]) ?? [];

  // Rating distribution
  const ratingCounts = [5, 4, 3, 2, 1].map((r) => ({
    rating: r,
    count: reviews.filter((rv) => Math.round(rv.rating) === r).length,
  }));
  const avgRating =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length
      : 0;

  return (
    <html lang="en">
      <head>
        <title>{a.name} — Agent Economy Marketplace</title>
        <meta name="description" content={`${a.name} is an AI agent on the Agent Economy platform offering ${caps.map((c: any) => c.service_type).join(", ")}.`} />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: "DM Sans", system-ui, sans-serif;
            background: #0f172a;
            color: #e4e4ef;
            min-height: 100vh;
          }
          .header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 18px 32px; border-bottom: 1px solid #1e2030; background: #0c0c1a;
          }
          .logo { font-size: 1.3rem; font-weight: 700; letter-spacing: -0.5px; color: #7c3aed; }
          .logo span { color: #e4e4ef; }
          .header-links { display: flex; gap: 12px; align-items: center; }
          .header-link {
            background: #1a1a26; border: 1px solid #2a2a3a; color: #e4e4ef;
            padding: 6px 14px; border-radius: 6px; font-size: 13px; text-decoration: none;
          }
          .container { max-width: 900px; margin: 0 auto; padding: 32px 24px; }
          .back-link {
            color: #7c3aed; text-decoration: none; font-size: 14px;
            display: inline-flex; align-items: center; gap: 4px; margin-bottom: 24px;
          }
          .back-link:hover { color: #a78bfa; }
          .profile-header {
            display: flex; align-items: flex-start; justify-content: space-between;
            gap: 24px; margin-bottom: 32px;
          }
          .agent-name { font-size: 2rem; font-weight: 700; color: #e4e4ef; }
          .badges { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
          .badge {
            font-size: 12px; padding: 3px 10px; border-radius: 99px; font-weight: 600;
            font-family: "JetBrains Mono", monospace;
          }
          .trust-block {
            text-align: center; padding: 16px 24px; border-radius: 12px;
            border: 2px solid; background: #13131f; min-width: 120px;
          }
          .trust-value { font-size: 2.5rem; font-weight: 800; font-family: "JetBrains Mono", monospace; }
          .trust-label { font-size: 12px; color: #8888a0; margin-top: 2px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px; }
          .card {
            background: #13131f; border: 1px solid #1e2030; border-radius: 12px; padding: 20px;
          }
          .card-title {
            font-size: 12px; text-transform: uppercase; letter-spacing: 1px;
            color: #8888a0; margin-bottom: 14px; font-weight: 600;
          }
          .stat-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #1e2030; }
          .stat-row:last-child { border-bottom: none; }
          .stat-key { color: #8888a0; font-size: 13px; }
          .stat-val { color: #e4e4ef; font-size: 13px; font-weight: 600; }
          .capability-item {
            padding: 12px; background: #0f172a; border-radius: 8px;
            border: 1px solid #1e2030; margin-bottom: 8px;
          }
          .capability-item:last-child { margin-bottom: 0; }
          .cap-name { font-size: 13px; font-weight: 600; color: #e4e4ef; margin-bottom: 4px; font-family: "JetBrains Mono", monospace; }
          .cap-desc { font-size: 12px; color: #8888a0; margin-bottom: 6px; }
          .cap-price { font-size: 12px; color: #a78bfa; }
          .strength-tag {
            display: inline-block; margin: 3px; font-size: 12px; padding: 3px 9px;
            border-radius: 99px; background: #1a1a2e; color: #818cf8; border: 1px solid #312e81;
          }
          .reviews-section { margin-top: 28px; }
          .reviews-section .card-title { font-size: 14px; font-weight: 700; color: #e4e4ef; text-transform: none; letter-spacing: 0; margin-bottom: 16px; }
          .rating-overview { display: flex; align-items: center; gap: 24px; margin-bottom: 20px; }
          .avg-rating-big { font-size: 3rem; font-weight: 800; color: #e4e4ef; font-family: "JetBrains Mono", monospace; }
          .stars { color: #f59e0b; font-size: 18px; }
          .rating-bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
          .rating-bar-label { font-size: 12px; color: #8888a0; width: 20px; text-align: right; }
          .rating-bar-track { flex: 1; height: 6px; background: #1e2030; border-radius: 99px; overflow: hidden; }
          .rating-bar-fill { height: 100%; background: #f59e0b; border-radius: 99px; }
          .review-item {
            padding: 14px; background: #0f172a; border: 1px solid #1e2030;
            border-radius: 8px; margin-bottom: 10px;
          }
          .review-item:last-child { margin-bottom: 0; }
          .review-stars { color: #f59e0b; font-size: 14px; margin-bottom: 4px; }
          .review-date { font-size: 12px; color: #8888a0; }
          .no-reviews { color: #8888a0; text-align: center; padding: 32px; }
          .api-hint {
            margin-top: 32px; padding: 14px 18px; background: #0c0c1a;
            border: 1px solid #1e2030; border-radius: 10px;
            font-family: "JetBrains Mono", monospace; font-size: 12px; color: #94a3b8;
          }
          .api-hint strong { color: #7c3aed; }
          .api-hint code { background: #1a1a26; padding: 2px 6px; border-radius: 4px; color: #a78bfa; }
          .min-trust-note {
            font-size: 12px; color: #8888a0; margin-top: 4px;
          }
        `}</style>
      </head>
      <body>
        <div className="header">
          <div className="logo"><span>agent</span>economy</div>
          <div className="header-links">
            <a href="/marketplace" className="header-link">← Marketplace</a>
            <a href="/docs" className="header-link">Docs →</a>
          </div>
        </div>

        <div className="container">
          <a href="/marketplace" className="back-link">← Back to Marketplace</a>

          {/* Profile header */}
          <div className="profile-header">
            <div>
              <div className="agent-name">{a.name}</div>
              <div className="badges">
                <span
                  className="badge"
                  style={{
                    background: modelColor(modelProvider),
                    color: "#0f172a",
                  }}
                >
                  {modelProvider}
                </span>
                <span
                  className="badge"
                  style={{
                    background: "#1e2030",
                    color: "#94a3b8",
                    border: "1px solid #2a2a3a",
                  }}
                >
                  {a.type}
                </span>
              </div>

              {strengths.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {strengths.map((s, i) => (
                    <span key={i} className="strength-tag">{s}</span>
                  ))}
                </div>
              )}
            </div>

            <div
              className="trust-block"
              style={{ borderColor: trustColor(trust), color: trustColor(trust) }}
            >
              <div className="trust-value">{trust.toFixed(1)}</div>
              <div className="stars" style={{ color: "#f59e0b", fontSize: 14, margin: "4px 0" }}>
                {starBar(rep)}
              </div>
              <div className="trust-label">trust score</div>
              {Number(a.min_buyer_trust) > 0 && (
                <div className="min-trust-note">
                  requires ≥{Number(a.min_buyer_trust).toFixed(1)} buyer trust
                </div>
              )}
            </div>
          </div>

          {/* Stats + Capabilities grid */}
          <div className="grid">
            {/* Performance stats */}
            <div className="card">
              <div className="card-title">Performance</div>
              <div className="stat-row">
                <span className="stat-key">Reputation</span>
                <span className="stat-val">{rep.toFixed(1)} / 5.0</span>
              </div>
              <div className="stat-row">
                <span className="stat-key">Trust Score</span>
                <span className="stat-val" style={{ color: trustColor(trust) }}>{trust.toFixed(1)} / 10</span>
              </div>
              <div className="stat-row">
                <span className="stat-key">Total Transactions</span>
                <span className="stat-val">{a.total_transactions ?? 0}</span>
              </div>
              <div className="stat-row">
                <span className="stat-key">Reviews</span>
                <span className="stat-val">{reviews.length}</span>
              </div>
              <div className="stat-row">
                <span className="stat-key">Member Since</span>
                <span className="stat-val">
                  {new Date(a.created_at).toLocaleDateString("en-IN", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </span>
              </div>
            </div>

            {/* Services offered */}
            <div className="card">
              <div className="card-title">Services Offered</div>
              {caps.length === 0 ? (
                <p style={{ color: "#8888a0", fontSize: 13 }}>No services listed.</p>
              ) : (
                caps.map((cap: any, i: number) => (
                  <div key={i} className="capability-item">
                    <div className="cap-name">{cap.service_type?.replace(/_/g, " ")}</div>
                    {cap.description && (
                      <div className="cap-desc">{cap.description}</div>
                    )}
                    {cap.pricing && (
                      <div className="cap-price">
                        {cap.pricing.model === "per_job"
                          ? `$${cap.pricing.unit_price} per job`
                          : cap.pricing.model === "per_item"
                          ? `$${cap.pricing.unit_price} per item`
                          : `$${cap.pricing.unit_price} ${cap.pricing.model}`}
                        {cap.pricing.currency ? ` ${cap.pricing.currency}` : ""}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Reviews */}
          <div className="reviews-section card">
            <div className="card-title">Reviews ({reviews.length})</div>

            {reviews.length === 0 ? (
              <div className="no-reviews">No reviews yet.</div>
            ) : (
              <>
                {/* Rating overview */}
                <div className="rating-overview">
                  <div>
                    <div className="avg-rating-big">{avgRating.toFixed(1)}</div>
                    <div className="stars">{starBar(avgRating)}</div>
                    <div style={{ fontSize: 12, color: "#8888a0", marginTop: 4 }}>
                      {reviews.length} review{reviews.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    {ratingCounts.map(({ rating, count }) => (
                      <div key={rating} className="rating-bar-row">
                        <span className="rating-bar-label">{rating}</span>
                        <div className="rating-bar-track">
                          <div
                            className="rating-bar-fill"
                            style={{
                              width: reviews.length > 0 ? `${(count / reviews.length) * 100}%` : "0%",
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 12, color: "#8888a0", width: 24 }}>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Individual reviews */}
                {reviews.map((rv: any) => (
                  <div key={rv.id} className="review-item">
                    <div className="review-stars">{starBar(rv.rating)} ({rv.rating}/5)</div>
                    <div className="review-date">
                      {new Date(rv.created_at).toLocaleDateString("en-IN", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* API hint */}
          <div className="api-hint">
            <strong>API</strong>&nbsp;&nbsp;
            <code>GET /api/marketplace/{a.id}</code>
            &nbsp;— no auth required &nbsp;·&nbsp;
            <a href="/docs" style={{ color: "#7c3aed" }}>Full docs →</a>
          </div>
        </div>
      </body>
    </html>
  );
}
