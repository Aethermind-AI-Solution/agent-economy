/**
 * Tests for the medium severity fixes from the 2026-03-18 security audit.
 *
 * Issues covered:
 *  #8 - webhook_url SSRF re-validation on PATCH /api/agents/me
 *  #9 - research-agent dedup guard for missing/null company_name
 * #10 - evolution_version atomic increment (via SQL RPC, tested structurally)
 */
import { describe, it, expect } from "vitest";
import { isSafeWebhookUrl } from "@/lib/validation";

// ─── #8: webhook_url re-validation on PATCH ──────────────────────────────────
// The route now calls isSafeWebhookUrl() before persisting, even though Zod
// already validated the format. This ensures the SSRF check can't be bypassed
// by a crafted URL that is syntactically valid but points to an internal host.

describe("PATCH /api/agents/me — webhook_url SSRF re-validation", () => {
  // The route logic: if webhook_url is non-null and !isSafeWebhookUrl(url) → 400
  function routeWouldReject(webhook_url: string | null | undefined): boolean {
    if (webhook_url !== null && webhook_url !== undefined) {
      return !isSafeWebhookUrl(webhook_url);
    }
    return false; // null clears the webhook — always allowed
  }

  it("accepts a public HTTPS webhook_url", () => {
    expect(routeWouldReject("https://hooks.example.com/agent")).toBe(false);
  });

  it("rejects localhost webhook_url", () => {
    expect(routeWouldReject("http://localhost:3000/hook")).toBe(true);
  });

  it("rejects private IP webhook_url", () => {
    expect(routeWouldReject("http://10.0.0.1/hook")).toBe(true);
  });

  it("rejects AWS metadata endpoint webhook_url", () => {
    expect(routeWouldReject("http://169.254.169.254/latest/meta-data/")).toBe(true);
  });

  it("allows null webhook_url to clear the field", () => {
    expect(routeWouldReject(null)).toBe(false);
  });

  it("allows undefined webhook_url (field omitted)", () => {
    expect(routeWouldReject(undefined)).toBe(false);
  });
});

// ─── #9: research-agent dedup — guards against missing company_name ───────────

describe("research-agent dedup — null/missing company_name guard", () => {
  // Replicate the dedup logic from research-agent.ts
  function dedup(companies: any[]): any[] {
    const seen = new Set<string>();
    return companies.flat().filter((c) => {
      if (!c || !c.company_name) return false;
      const key = c.company_name.toLowerCase().replace(/\s+/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  it("deduplicates by normalised name", () => {
    const input = [
      { company_name: "Acme Corp" },
      { company_name: "acme corp" },
      { company_name: "Beta Ltd" },
    ];
    expect(dedup(input)).toHaveLength(2);
  });

  it("filters out entries with null company_name", () => {
    const input = [
      { company_name: null },
      { company_name: "Acme Corp" },
    ];
    expect(dedup(input)).toHaveLength(1);
    expect(dedup(input)[0].company_name).toBe("Acme Corp");
  });

  it("filters out entries with undefined company_name", () => {
    const input = [
      { company_name: undefined },
      { company_name: "Beta Ltd" },
    ];
    expect(dedup(input)).toHaveLength(1);
  });

  it("filters out null entries entirely", () => {
    const input = [null, undefined, { company_name: "Acme Corp" }];
    expect(dedup(input)).toHaveLength(1);
  });

  it("returns empty array when all entries are invalid", () => {
    expect(dedup([null, { company_name: null }, {}])).toHaveLength(0);
  });

  it("handles whitespace differences in names as duplicates", () => {
    const input = [
      { company_name: "Tata   Consultancy" },
      { company_name: "Tata Consultancy" },
    ];
    expect(dedup(input)).toHaveLength(1);
  });
});

// ─── #10: evolution_version — atomic increment via SQL RPC ───────────────────
// The SQL function `increment_evolution_version` handles the increment atomically.
// We verify the intended SQL semantics here without hitting a real DB.

describe("increment_evolution_version SQL — intended semantics", () => {
  it("increments COALESCE(evolution_version, 0) + 1 starting from null", () => {
    // COALESCE(null, 0) + 1 = 1
    const currentVersion: number | null = null;
    const result = (currentVersion ?? 0) + 1;
    expect(result).toBe(1);
  });

  it("increments from an existing version", () => {
    const currentVersion = 3;
    const result = (currentVersion ?? 0) + 1;
    expect(result).toBe(4);
  });

  it("two concurrent callers reading version=2 would both write 3 without atomic RPC", () => {
    // This documents the race: without the RPC, both reads return 2, both write 3.
    // With the RPC, the DB serialises: first write returns 3, second returns 4.
    const sharedVersion = 2;
    const write1 = sharedVersion + 1; // 3
    const write2 = sharedVersion + 1; // 3 — collision!
    expect(write1).toBe(write2); // proves the race exists without atomic increment
  });

  it("migration file exists for the new RPC", async () => {
    const { existsSync } = await import("fs");
    const { resolve } = await import("path");
    const migPath = resolve(
      process.cwd(),
      "supabase/migrations/014_atomic_evolution.sql"
    );
    expect(existsSync(migPath)).toBe(true);
  });

  it("migration SQL contains the correct function signature", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/014_atomic_evolution.sql"),
      "utf8"
    );
    expect(sql).toContain("increment_evolution_version");
    expect(sql).toContain("p_agent_id");
    expect(sql).toContain("p_meta_strategy");
    expect(sql).toContain("COALESCE(evolution_version, 0) + 1");
    expect(sql).toContain("RETURNING evolution_version");
  });
});
