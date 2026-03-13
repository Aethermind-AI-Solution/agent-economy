import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

function statusColor(status: string) {
  const map: Record<string, string> = {
    completed: "#059669", accepted: "#2563eb", delivered: "#7c3aed",
    rfq_sent: "#ca8a04", offer_sent: "#ea580c", disputed: "#dc2626",
    rejected: "#6b7280", expired: "#6b7280",
  };
  return map[status] ?? "#6b7280";
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "#8888a0",
  textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 12,
  paddingBottom: 8, borderBottom: "1px solid #2a2a3a",
};

const jsonBlock: React.CSSProperties = {
  background: "#12121a", border: "1px solid #2a2a3a", borderRadius: 8,
  padding: 20, overflow: "auto", fontSize: 13,
  fontFamily: "JetBrains Mono, monospace", color: "#e4e4ef",
  lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
};

// ── Smart renderers ──────────────────────────────────────────────────────────

function ScoredLeadsTable({ leads }: { leads: any[] }) {
  return (
    <div>
      <div style={sectionLabel}>Delivery — Scored Leads ({leads.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {leads.map((lead: any, i: number) => (
          <div key={i} style={{
            background: "#12121a", border: "1px solid #2a2a3a",
            borderRadius: 8, padding: "16px 20px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <span style={{
                fontFamily: "JetBrains Mono, monospace", fontWeight: 700,
                fontSize: 22, color: lead.score >= 9 ? "#059669" : lead.score >= 7 ? "#3b82f6" : "#ca8a04",
              }}>{lead.score}<span style={{ fontSize: 13, color: "#8888a0" }}>/10</span></span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{lead.company_name}</div>
                <div style={{ fontSize: 13, color: "#8888a0" }}>{lead.industry} · {lead.company_size}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: "#8888a0", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Decision Maker</div>
                <div style={{ fontSize: 13 }}>{lead.decision_maker}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#8888a0", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Contact</div>
                <div style={{ fontSize: 13 }}>{lead.contact_info}</div>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: "#8888a0", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Pain Points</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {lead.pain_points?.map((p: string, j: number) => (
                  <li key={j} style={{ fontSize: 13, color: "#c4c4d4", marginBottom: 3 }}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#8888a0", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Recommended Solution</div>
              <div style={{ fontSize: 13, color: "#a5f3d0" }}>{lead.recommended_solution}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutreachDraftsCards({ drafts }: { drafts: any[] }) {
  return (
    <div>
      <div style={sectionLabel}>Delivery — Outreach Drafts ({drafts.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {drafts.map((draft: any, i: number) => (
          <div key={i} style={{
            background: "#12121a", border: "1px solid #2a2a3a",
            borderRadius: 8, padding: "20px 24px",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{
                fontFamily: "JetBrains Mono, monospace", fontSize: 13, fontWeight: 700,
                padding: "3px 10px", borderRadius: 4,
                background: draft.score >= 9 ? "#05966922" : "#3b82f622",
                color: draft.score >= 9 ? "#059669" : "#3b82f6",
              }}>{draft.score}/10</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{draft.company_name}</div>
                <div style={{ fontSize: 12, color: "#8888a0" }}>To: {draft.decision_maker}</div>
              </div>
            </div>

            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "#8888a0", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Email</div>
              <div style={{
                background: "#0a0a0f", border: "1px solid #2a2a3a", borderRadius: 6, padding: "12px 16px",
              }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: "#3b82f6", marginBottom: 10,
                  paddingBottom: 8, borderBottom: "1px solid #2a2a3a",
                }}>
                  Subject: {draft.subject_line}
                </div>
                <pre style={{
                  margin: 0, fontSize: 13, fontFamily: "DM Sans, sans-serif",
                  whiteSpace: "pre-wrap", lineHeight: 1.7, color: "#c4c4d4",
                }}>{draft.email_body}</pre>
              </div>
            </div>

            {/* LinkedIn */}
            <div>
              <div style={{ fontSize: 10, color: "#8888a0", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>LinkedIn Message</div>
              <div style={{
                background: "#0a0a0f", border: "1px solid #2a2a3a", borderRadius: 6,
                padding: "12px 16px", fontSize: 13, color: "#c4c4d4", lineHeight: 1.7,
              }}>
                {draft.linkedin_message}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RfqSection({ rfq }: { rfq: any }) {
  if (!rfq) return null;
  const companiesCount = rfq.companies?.length;
  const displayRfq = companiesCount
    ? { ...rfq, companies: `[${companiesCount} companies — collapsed for readability]` }
    : rfq;
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={sectionLabel}>RFQ Payload (Request)</div>
      {rfq.query && (
        <div style={{
          background: "#1a1a26", border: "1px solid #3b82f6", borderRadius: 8,
          padding: "12px 16px", marginBottom: 12, fontSize: 14,
        }}>
          <span style={{ color: "#8888a0", fontSize: 12, marginRight: 8 }}>QUERY</span>
          <strong>{rfq.query}</strong>
        </div>
      )}
      <pre style={jsonBlock}>{JSON.stringify(displayRfq, null, 2)}</pre>
    </div>
  );
}

function DeliverySection({ delivery }: { delivery: any }) {
  if (!delivery) return null;
  const artifact = delivery.artifacts?.[0];
  if (artifact?.type === "scored_leads") return <ScoredLeadsTable leads={artifact.data} />;
  if (artifact?.type === "outreach_drafts") return <OutreachDraftsCards drafts={artifact.data} />;
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={sectionLabel}>Delivery Payload</div>
      <pre style={jsonBlock}>{JSON.stringify(delivery, null, 2)}</pre>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ConversationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [{ data: conv }, { data: agents }] = await Promise.all([
    supabase.from("conversations").select("*").eq("id", id).single(),
    supabase.from("agents").select("id, name, type"),
  ]);

  if (!conv) notFound();

  const agentMap = Object.fromEntries((agents ?? []).map((a: any) => [a.id, a]));
  const buyer = agentMap[conv.buyer_id];
  const vendor = agentMap[conv.vendor_id];
  const color = statusColor(conv.status);

  return (
    <html lang="en">
      <head>
        <title>Conversation {id.slice(0, 8)} — Agent Economy</title>
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
          <a href="/" style={{ color: "#8888a0", fontSize: 14, textDecoration: "none" }}>← Back to Dashboard</a>
        </div>

        <div style={{ padding: "32px 40px", maxWidth: 960 }}>

          {/* Title + status */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
              <h1 style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 20, fontWeight: 700, margin: 0 }}>
                Conversation
              </h1>
              <span style={{
                padding: "4px 12px", borderRadius: 4, fontSize: 12, fontWeight: 600,
                fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase",
                background: color + "22", color,
              }}>{conv.status}</span>
            </div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: "#8888a0" }}>{id}</div>
          </div>

          {/* Meta grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
            {[
              { label: "Service", value: conv.service_type },
              { label: "Buyer", value: buyer?.name ?? conv.buyer_id.slice(0, 12) },
              { label: "Vendor", value: vendor?.name ?? conv.vendor_id.slice(0, 12) },
              { label: "Escrow", value: conv.escrow_amount ? `$${Number(conv.escrow_amount).toFixed(2)}` : "—" },
              { label: "Platform Fee", value: conv.platform_fee ? `$${Number(conv.platform_fee).toFixed(2)}` : "—" },
              { label: "Created", value: new Date(conv.created_at).toLocaleString() },
              { label: "Updated", value: new Date(conv.updated_at).toLocaleString() },
              { label: "Expires", value: conv.expires_at ? new Date(conv.expires_at).toLocaleString() : "—" },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: "#12121a", border: "1px solid #2a2a3a", borderRadius: 8, padding: "14px 16px" }}>
                <div style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "#8888a0", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>
                  {label}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, wordBreak: "break-all" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Smart payload sections */}
          <RfqSection rfq={conv.rfq_payload} />

          {conv.offer_payload && (
            <div style={{ marginBottom: 32 }}>
              <div style={sectionLabel}>Offer Payload</div>
              <pre style={jsonBlock}>{JSON.stringify(conv.offer_payload, null, 2)}</pre>
            </div>
          )}

          <DeliverySection delivery={conv.delivery_payload} />
        </div>
      </body>
    </html>
  );
}
