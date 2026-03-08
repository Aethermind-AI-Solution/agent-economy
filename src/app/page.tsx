import { createClient } from "@supabase/supabase-js";

// Disable Next.js caching — always fetch live data on every request
export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function getData() {
  const [agents, conversations, reviews] = await Promise.all([
    supabase.from("agents").select("*").order("created_at", { ascending: false }),
    supabase.from("conversations").select("*").order("created_at", { ascending: false }),
    supabase.from("reviews").select("*"),
  ]);
  return {
    agents: agents.data ?? [],
    conversations: conversations.data ?? [],
    reviews: reviews.data ?? [],
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

export default async function Dashboard() {
  const { agents, conversations, reviews } = await getData();

  const completedTx = conversations.filter((c: any) => c.status === "completed");
  const totalEscrow = completedTx.reduce((sum: number, c: any) => sum + (Number(c.escrow_amount) || 0), 0);
  const totalFees = completedTx.reduce((sum: number, c: any) => sum + (Number(c.platform_fee) || 0), 0);
  const activeTx = conversations.filter((c: any) =>
    ["rfq_sent", "offer_sent", "accepted", "delivered"].includes(c.status)
  );
  const disputedTx = conversations.filter((c: any) => c.status === "disputed");

  return (
    <html lang="en">
      <head>
        <title>Agent Economy — Admin</title>
        <meta httpEquiv="refresh" content="5" />
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
            grid-template-columns: repeat(5, 1fr);
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
          .amount {
            font-family: 'JetBrains Mono', monospace;
            font-weight: 600;
          }
        `}</style>
      </head>
      <body>
        <div className="header">
          <div className="logo">
            <span>agent</span>economy
          </div>
          <div className="badge">Admin Dashboard</div>
        </div>

        <div className="main">
          {/* Stats */}
          <div className="stats">
            <div className="stat">
              <div className="stat-label">Registered Agents</div>
              <div className="stat-value accent">{agents.length}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Completed Transactions</div>
              <div className="stat-value green">{completedTx.length}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Active Transactions</div>
              <div className="stat-value orange">{activeTx.length}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Total Volume</div>
              <div className="stat-value green">${totalEscrow.toFixed(2)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Platform Fees</div>
              <div className="stat-value green">${totalFees.toFixed(2)}</div>
            </div>
          </div>

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

          {/* Conversations */}
          <div className="section">
            <div className="section-title">Conversations / Transactions</div>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Service</th>
                  <th>Buyer</th>
                  <th>Vendor</th>
                  <th>Status</th>
                  <th>Escrow</th>
                  <th>Fee</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((c: any) => {
                  const buyer = agents.find((a: any) => a.id === c.buyer_id);
                  const vendor = agents.find((a: any) => a.id === c.vendor_id);
                  return (
                    <tr key={c.id}>
                      <td className="uuid">{c.id.slice(0, 8)}...</td>
                      <td className="mono">{c.service_type}</td>
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
          </div>

          {/* Disputes */}
          {disputedTx.length > 0 && (
            <div className="section">
              <div className="section-title" style={{ color: "#dc2626" }}>
                Disputed Transactions
              </div>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Service</th>
                    <th>Escrow Locked</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {disputedTx.map((c: any) => (
                    <tr key={c.id}>
                      <td className="uuid">{c.id.slice(0, 8)}...</td>
                      <td className="mono">{c.service_type}</td>
                      <td className="amount" style={{ color: "#dc2626" }}>
                        ${Number(c.escrow_amount).toFixed(2)}
                      </td>
                      <td className="mono" style={{ color: "#8888a0", fontSize: 12 }}>
                        {new Date(c.created_at).toLocaleString()}
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
