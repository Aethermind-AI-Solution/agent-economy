import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatSearchResults, webSearch } from "@/lib/web-search";

describe("formatSearchResults", () => {
  it("returns empty string for empty array", () => {
    expect(formatSearchResults([])).toBe("");
  });

  it("truncates content at 300 chars", () => {
    const longContent = "C".repeat(400);
    const result = formatSearchResults([{ title: "T", url: "U", content: longContent }]);
    expect(result).toContain("C".repeat(300));
    expect(result).not.toContain("C".repeat(301));
  });

  it("formats multiple results with numbered headings", () => {
    const results = [
      { title: "Title1", url: "http://a.com", content: "Content1" },
      { title: "Title2", url: "http://b.com", content: "Content2" },
    ];
    const formatted = formatSearchResults(results);
    expect(formatted).toContain("[1] Title1");
    expect(formatted).toContain("[2] Title2");
    expect(formatted).toContain("http://a.com");
    expect(formatted).toContain("http://b.com");
  });
});

describe("webSearch", () => {
  const originalEnv = process.env.TAVILY_API_KEY;

  beforeEach(() => {
    delete process.env.TAVILY_API_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) process.env.TAVILY_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns empty array without TAVILY_API_KEY without throwing", async () => {
    const results = await webSearch("test query");
    expect(results).toEqual([]);
  });

  it("returns empty array on fetch error without throwing", async () => {
    process.env.TAVILY_API_KEY = "fake-key";
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));
    const results = await webSearch("test query");
    expect(results).toEqual([]);
  });

  it("returns empty array on non-ok response", async () => {
    process.env.TAVILY_API_KEY = "fake-key";
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
    } as any);
    const results = await webSearch("test query");
    expect(results).toEqual([]);
  });
});
