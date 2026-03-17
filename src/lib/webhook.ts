import { supabase } from "./supabase";

export interface WebhookPayload {
  event: "state_transition";
  conversation_id: string;
  from_status: string;
  to_status: string;
  message_type: string;
  side_effect: string | null;
  conversation: Record<string, unknown>;
  timestamp: string;
}

/**
 * Fire-and-forget webhook delivery to both buyer and vendor agents.
 * Fetches each agent's webhook_url and POSTs the payload.
 * Never throws — failures are logged and silently swallowed.
 */
export async function deliverWebhooks(
  buyerId: string,
  vendorId: string,
  payload: WebhookPayload
): Promise<void> {
  const { data: agents } = await supabase
    .from("agents")
    .select("id, webhook_url")
    .in("id", [buyerId, vendorId])
    .not("webhook_url", "is", null);

  if (!agents || agents.length === 0) return;

  await Promise.all(
    agents.map(async (agent) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5_000);
        await fetch(agent.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, recipient_agent_id: agent.id }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
      } catch {
        console.log(JSON.stringify({
          event: "webhook_failed",
          agent_id: agent.id,
          url: agent.webhook_url,
        }));
      }
    })
  );
}
