import { z } from "zod";

/**
 * SSRF protection: rejects URLs that resolve to private/internal network addresses.
 * Applied to webhook_url at both registration and update time.
 */
export function isSafeWebhookUrl(urlString: string): boolean {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(url.protocol)) return false;

  const hostname = url.hostname.toLowerCase();

  // Localhost variants
  if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(hostname)) return false;

  // Link-local (AWS/GCP/Azure metadata endpoints: 169.254.169.254)
  if (hostname.startsWith("169.254.")) return false;

  // Private IPv4 ranges: 10.x, 172.16-31.x, 192.168.x
  if (
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^192\.168\./.test(hostname)
  ) return false;

  // Private IPv6 (ULA: fc00::/7, link-local: fe80::/10)
  if (/^fe[89ab]/i.test(hostname) || /^f[cd]/i.test(hostname)) return false;

  return true;
}

const safeWebhookUrl = z.string().url().refine(isSafeWebhookUrl, {
  message: "webhook_url must be a publicly accessible URL (private/internal IPs are not allowed)",
});

/** Shared capability item shape — used in both Register and Update schemas */
const CapabilitySchema = z.object({
  service_type: z.string().min(1),
  pricing: z.object({
    model: z.string(),
    unit_price: z.number().positive(),
    currency: z.string().length(3),
  }),
  description: z.string().optional(),
});

export const RegisterSchema = z.object({
  name: z.string().min(1, "name is required").max(100),
  type: z.enum(["buyer", "vendor", "both"], {
    errorMap: () => ({ message: "type must be: buyer, vendor, or both" }),
  }),
  capabilities: z.array(CapabilitySchema).optional().default([]),
  agent_role: z.enum(["standalone", "orchestrator", "worker"]).optional().default("standalone"),
  model_provider: z.enum(["claude", "openai", "custom", "any"]).optional().default("claude"),
  strengths: z.array(z.string()).optional().default([]),
  webhook_url: safeWebhookUrl.optional(),
});

export const CreateConversationSchema = z.object({
  vendor_id: z.string().uuid("vendor_id must be a valid UUID"),
  service_type: z.string().min(1, "service_type is required"),
  rfq: z.record(z.unknown()),
});

export const SendMessageSchema = z.object({
  message_type: z.enum(
    ["offer", "accept", "reject", "deliver", "confirm", "dispute"],
    { errorMap: () => ({ message: "Invalid message_type" }) }
  ),
  payload: z.record(z.unknown()).optional().default({}),
});

export const UpdateAgentSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    type: z.enum(["buyer", "vendor", "both"]).optional(),
    capabilities: z.array(CapabilitySchema).optional(),
    strengths: z.array(z.string()).optional(),
    webhook_url: safeWebhookUrl.nullable().optional(),
    meta_strategy: z.record(z.unknown()).nullable().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.type !== undefined ||
      data.capabilities !== undefined ||
      data.strengths !== undefined ||
      data.webhook_url !== undefined ||
      data.meta_strategy !== undefined,
    { message: "No fields to update. Allowed: name, type, capabilities, strengths, webhook_url, meta_strategy" }
  );
