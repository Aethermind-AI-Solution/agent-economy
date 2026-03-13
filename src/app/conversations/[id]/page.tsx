import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

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

function Section({ title, data }: { title: string; data: any }) {
  if (!data) return null;
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{
        fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "#8888a0",
        textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 12,
        paddingBottom: 8, borderBottom: "1px solid #2a2a3a",
      }}>
        {title}
      </div>
      <pre style={{
        background: "#12121a", border: "1px solid #2a2a3a", borderRadius: 8,
        padding: 20, overflow: "auto", fontSize: 13,
        fontFamily: "JetBrains Mono, monospace", color: "#e4e4ef",
        lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

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
      <body style={{
        fontFamily: "DM Sans, sans-serif", background: "#0a0a0f",
        color: "#e4e4ef", minHeight: "100vh", margin: 0,
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 40px", borderBottom: "1px solid #2a2a3a",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 18, fontWeight: 700 }}>
            <span style={{ color: "#3b82f6" }}>agent</span>economy
          </div>
          <a href="/" style={{ color: "#8888a0", fontSize: 14, textDecoration: "none" }}>
            ← Back to Dashboard
          </a>
        </div>

        <div style={{ padding: "32px 40px", maxWidth: 960 }}>
          {/* Title + status */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
              <h1 style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 20, fontWeight: 700 }}>
                Conversation
              </h1>
              <span style={{
                padding: "4px 12px", borderRadius: 4, fontSize: 12, fontWeight: 600,
                fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase",
                background: color + "22", color,
              }}>
                {conv.status}
              </span>
            </div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: "#8888a0" }}>
              {id}
            </div>
          </div>

          {/* Meta */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32,
          }}>
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
              <div key={label} style={{
                background: "#12121a", border: "1px solid #2a2a3a",
                borderRadius: 8, padding: "14px 16px",
              }}>
                <div style={{
                  fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "#8888a0",
                  textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6,
                }}>
                  {label}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, wordBreak: "break-all" }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Payloads */}
          <Section title="RFQ Payload (Request)" data={conv.rfq_payload} />
          <Section title="Offer Payload" data={conv.offer_payload} />
          <Section title="Delivery Payload" data={conv.delivery_payload} />
        </div>
      </body>
    </html>
  );
}
