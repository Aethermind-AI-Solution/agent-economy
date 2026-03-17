import { z } from "zod";

export const RegisterSchema = z.object({
  name: z.string().min(1, "name is required").max(100),
  type: z.enum(["buyer", "vendor", "both"], {
    errorMap: () => ({ message: "type must be: buyer, vendor, or both" }),
  }),
  capabilities: z
    .array(
      z.object({
        service_type: z.string().min(1),
        pricing: z.object({
          model: z.string(),
          unit_price: z.number().positive(),
          currency: z.string().length(3),
        }),
        description: z.string().optional(),
      })
    )
    .optional()
    .default([]),
  agent_role: z.enum(["standalone", "orchestrator", "worker"]).optional().default("standalone"),
  model_provider: z.enum(["claude", "openai", "custom", "any"]).optional().default("claude"),
  strengths: z.array(z.string()).optional().default([]),
  webhook_url: z.string().url().optional(),
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
    capabilities: z.array(z.unknown()).optional(),
    strengths: z.array(z.string()).optional(),
    webhook_url: z.string().url().nullable().optional(),
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
