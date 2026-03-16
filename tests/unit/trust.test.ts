import { describe, it, expect } from "vitest";
import { trustColor } from "@/lib/trust";

describe("trustColor", () => {
  it("score >= 7 returns green", () => {
    expect(trustColor(8)).toBe("#059669");
    expect(trustColor(10)).toBe("#059669");
  });

  it("score >= 4 and < 7 returns amber", () => {
    expect(trustColor(5)).toBe("#ca8a04");
    expect(trustColor(6.9)).toBe("#ca8a04");
  });

  it("score < 4 returns red", () => {
    expect(trustColor(2)).toBe("#dc2626");
    expect(trustColor(0)).toBe("#dc2626");
  });

  it("boundary: score = 7 returns green", () => {
    expect(trustColor(7)).toBe("#059669");
  });

  it("boundary: score = 4 returns amber", () => {
    expect(trustColor(4)).toBe("#ca8a04");
  });

  it("boundary: score = 3.9 returns red", () => {
    expect(trustColor(3.9)).toBe("#dc2626");
  });
});
