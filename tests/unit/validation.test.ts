import { describe, it, expect } from "vitest";
import { RegisterSchema, CreateConversationSchema, SendMessageSchema } from "@/lib/validation";

describe("RegisterSchema", () => {
  it("valid agent passes", () => {
    const r = RegisterSchema.safeParse({ name: "TestAgent", type: "buyer" });
    expect(r.success).toBe(true);
  });

  it("valid vendor with capabilities passes", () => {
    const r = RegisterSchema.safeParse({
      name: "VendorAgent",
      type: "vendor",
      capabilities: [{ service_type: "image_generation", pricing: { model: "per_unit", unit_price: 1.5, currency: "USD" } }],
    });
    expect(r.success).toBe(true);
  });

  it("missing name fails", () => {
    const r = RegisterSchema.safeParse({ type: "buyer" });
    expect(r.success).toBe(false);
  });

  it("invalid type fails", () => {
    const r = RegisterSchema.safeParse({ name: "X", type: "admin" });
    expect(r.success).toBe(false);
    expect(r.error?.flatten().fieldErrors.type).toBeTruthy();
  });

  it("valid model_provider and strengths pass", () => {
    const r = RegisterSchema.safeParse({ name: "X", type: "both", model_provider: "openai", strengths: ["lead_gen"] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.model_provider).toBe("openai");
      expect(r.data.strengths).toEqual(["lead_gen"]);
    }
  });

  it("invalid model_provider fails", () => {
    const r = RegisterSchema.safeParse({ name: "X", type: "buyer", model_provider: "gemini" });
    expect(r.success).toBe(false);
  });

  it("defaults model_provider to claude", () => {
    const r = RegisterSchema.safeParse({ name: "X", type: "buyer" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.model_provider).toBe("claude");
  });
});

describe("CreateConversationSchema", () => {
  it("valid UUID vendor_id passes", () => {
    const r = CreateConversationSchema.safeParse({
      vendor_id: "550e8400-e29b-41d4-a716-446655440000",
      service_type: "image_generation",
      rfq: { requirements: "5 product images" },
    });
    expect(r.success).toBe(true);
  });

  it("non-UUID vendor_id fails", () => {
    const r = CreateConversationSchema.safeParse({
      vendor_id: "not-a-uuid",
      service_type: "image_generation",
      rfq: {},
    });
    expect(r.success).toBe(false);
    expect(r.error?.flatten().fieldErrors.vendor_id).toBeTruthy();
  });

  it("empty service_type fails", () => {
    const r = CreateConversationSchema.safeParse({
      vendor_id: "550e8400-e29b-41d4-a716-446655440000",
      service_type: "",
      rfq: {},
    });
    expect(r.success).toBe(false);
    expect(r.error?.flatten().fieldErrors.service_type).toBeTruthy();
  });
});

describe("SendMessageSchema", () => {
  it("valid message_type passes", () => {
    const r = SendMessageSchema.safeParse({ message_type: "offer", payload: { price: 10 } });
    expect(r.success).toBe(true);
  });

  it("all valid message types pass", () => {
    for (const t of ["offer", "accept", "reject", "deliver", "confirm", "dispute"]) {
      const r = SendMessageSchema.safeParse({ message_type: t });
      expect(r.success, `type=${t}`).toBe(true);
    }
  });

  it("unknown message_type fails", () => {
    const r = SendMessageSchema.safeParse({ message_type: "cancel" });
    expect(r.success).toBe(false);
    expect(r.error?.flatten().fieldErrors.message_type).toBeTruthy();
  });

  it("defaults payload to empty object", () => {
    const r = SendMessageSchema.safeParse({ message_type: "accept" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.payload).toEqual({});
  });
});
