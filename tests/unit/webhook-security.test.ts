import { describe, it, expect } from "vitest";
import { isSafeWebhookUrl, RegisterSchema, UpdateAgentSchema } from "@/lib/validation";

// ─── isSafeWebhookUrl ────────────────────────────────────────────────────────

describe("isSafeWebhookUrl — SSRF protection", () => {
  // Safe URLs
  it("allows public HTTPS URLs", () => {
    expect(isSafeWebhookUrl("https://example.com/hook")).toBe(true);
    expect(isSafeWebhookUrl("https://api.mycompany.io/webhooks")).toBe(true);
  });

  it("allows public HTTP URLs", () => {
    expect(isSafeWebhookUrl("http://example.com/hook")).toBe(true);
  });

  // Localhost variants
  it("blocks localhost", () => {
    expect(isSafeWebhookUrl("http://localhost/hook")).toBe(false);
    expect(isSafeWebhookUrl("http://localhost:3000/hook")).toBe(false);
  });

  it("blocks 127.0.0.1", () => {
    expect(isSafeWebhookUrl("http://127.0.0.1/hook")).toBe(false);
    expect(isSafeWebhookUrl("http://127.0.0.1:8080/hook")).toBe(false);
  });

  it("blocks ::1 (IPv6 loopback)", () => {
    expect(isSafeWebhookUrl("http://[::1]/hook")).toBe(false);
  });

  it("blocks 0.0.0.0", () => {
    expect(isSafeWebhookUrl("http://0.0.0.0/hook")).toBe(false);
  });

  // Cloud metadata endpoints
  it("blocks 169.254.169.254 (AWS/GCP/Azure metadata)", () => {
    expect(isSafeWebhookUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isSafeWebhookUrl("http://169.254.0.1/hook")).toBe(false);
  });

  // Private IPv4 ranges
  it("blocks 10.x.x.x (private Class A)", () => {
    expect(isSafeWebhookUrl("http://10.0.0.1/hook")).toBe(false);
    expect(isSafeWebhookUrl("http://10.255.255.255/hook")).toBe(false);
  });

  it("blocks 172.16-31.x.x (private Class B)", () => {
    expect(isSafeWebhookUrl("http://172.16.0.1/hook")).toBe(false);
    expect(isSafeWebhookUrl("http://172.31.255.255/hook")).toBe(false);
  });

  it("allows 172.15.x and 172.32.x (not private)", () => {
    expect(isSafeWebhookUrl("http://172.15.0.1/hook")).toBe(true);
    expect(isSafeWebhookUrl("http://172.32.0.1/hook")).toBe(true);
  });

  it("blocks 192.168.x.x (private Class C)", () => {
    expect(isSafeWebhookUrl("http://192.168.1.1/hook")).toBe(false);
    expect(isSafeWebhookUrl("http://192.168.0.100/hook")).toBe(false);
  });

  // Non-HTTP protocols
  it("blocks non-http protocols", () => {
    expect(isSafeWebhookUrl("ftp://example.com/hook")).toBe(false);
    expect(isSafeWebhookUrl("file:///etc/passwd")).toBe(false);
  });

  it("blocks malformed URLs", () => {
    expect(isSafeWebhookUrl("not-a-url")).toBe(false);
    expect(isSafeWebhookUrl("")).toBe(false);
  });
});

// ─── RegisterSchema — webhook_url SSRF check ─────────────────────────────────

describe("RegisterSchema — webhook_url validation", () => {
  it("accepts public webhook_url", () => {
    const r = RegisterSchema.safeParse({
      name: "Agent",
      type: "vendor",
      webhook_url: "https://hooks.example.com/agent",
    });
    expect(r.success).toBe(true);
  });

  it("rejects internal webhook_url (localhost)", () => {
    const r = RegisterSchema.safeParse({
      name: "Agent",
      type: "vendor",
      webhook_url: "http://localhost:3000/hook",
    });
    expect(r.success).toBe(false);
  });

  it("rejects internal webhook_url (private IP)", () => {
    const r = RegisterSchema.safeParse({
      name: "Agent",
      type: "vendor",
      webhook_url: "http://192.168.1.1/hook",
    });
    expect(r.success).toBe(false);
  });

  it("rejects AWS metadata endpoint as webhook_url", () => {
    const r = RegisterSchema.safeParse({
      name: "Agent",
      type: "vendor",
      webhook_url: "http://169.254.169.254/latest/meta-data/",
    });
    expect(r.success).toBe(false);
  });

  it("allows omitting webhook_url", () => {
    const r = RegisterSchema.safeParse({ name: "Agent", type: "buyer" });
    expect(r.success).toBe(true);
  });
});

// ─── UpdateAgentSchema — capabilities type safety ─────────────────────────────

describe("UpdateAgentSchema — capabilities type safety", () => {
  it("accepts well-formed capabilities array", () => {
    const r = UpdateAgentSchema.safeParse({
      capabilities: [{
        service_type: "lead_generation",
        pricing: { model: "per_run", unit_price: 5.00, currency: "USD" },
      }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects capabilities with missing service_type", () => {
    const r = UpdateAgentSchema.safeParse({
      capabilities: [{ pricing: { model: "per_run", unit_price: 5.00, currency: "USD" } }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects capabilities with negative unit_price", () => {
    const r = UpdateAgentSchema.safeParse({
      capabilities: [{
        service_type: "test",
        pricing: { model: "per_run", unit_price: -1, currency: "USD" },
      }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects capabilities with wrong currency length", () => {
    const r = UpdateAgentSchema.safeParse({
      capabilities: [{
        service_type: "test",
        pricing: { model: "per_run", unit_price: 1, currency: "USDD" },
      }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects update with no fields", () => {
    const r = UpdateAgentSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("allows nullable webhook_url to clear it", () => {
    const r = UpdateAgentSchema.safeParse({ webhook_url: null });
    expect(r.success).toBe(true);
  });

  it("rejects private IP as webhook_url in update", () => {
    const r = UpdateAgentSchema.safeParse({ webhook_url: "http://10.0.0.1/hook" });
    expect(r.success).toBe(false);
  });
});
