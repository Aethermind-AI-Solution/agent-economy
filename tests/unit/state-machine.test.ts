import { describe, it, expect } from "vitest";
import { validateTransition } from "@/lib/state-machine";

describe("validateTransition — valid transitions", () => {
  it("vendor can send offer from rfq_sent", () => {
    const r = validateTransition("rfq_sent", "offer", "vendor");
    expect(r.valid).toBe(true);
    expect(r.newStatus).toBe("offer_sent");
    expect(r.sideEffect).toBeUndefined();
  });

  it("buyer can accept from offer_sent", () => {
    const r = validateTransition("offer_sent", "accept", "buyer");
    expect(r.valid).toBe(true);
    expect(r.newStatus).toBe("accepted");
    expect(r.sideEffect).toBe("create_escrow");
  });

  it("buyer can reject from offer_sent", () => {
    const r = validateTransition("offer_sent", "reject", "buyer");
    expect(r.valid).toBe(true);
    expect(r.newStatus).toBe("rejected");
  });

  it("vendor can deliver from accepted", () => {
    const r = validateTransition("accepted", "deliver", "vendor");
    expect(r.valid).toBe(true);
    expect(r.newStatus).toBe("delivered");
  });

  it("buyer can confirm from delivered", () => {
    const r = validateTransition("delivered", "confirm", "buyer");
    expect(r.valid).toBe(true);
    expect(r.newStatus).toBe("completed");
    expect(r.sideEffect).toBe("release_escrow");
  });

  it("buyer can dispute from delivered", () => {
    const r = validateTransition("delivered", "dispute", "buyer");
    expect(r.valid).toBe(true);
    expect(r.newStatus).toBe("disputed");
    expect(r.sideEffect).toBe("freeze_escrow");
  });
});

describe("validateTransition — invalid role transitions", () => {
  it("buyer cannot send offer", () => {
    const r = validateTransition("rfq_sent", "offer", "buyer");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/vendor/);
  });

  it("vendor cannot accept offer", () => {
    const r = validateTransition("offer_sent", "accept", "vendor");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/buyer/);
  });

  it("buyer cannot deliver", () => {
    const r = validateTransition("accepted", "deliver", "buyer");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/vendor/);
  });
});

describe("validateTransition — invalid state transitions", () => {
  it("cannot accept when already accepted", () => {
    const r = validateTransition("accepted", "accept", "buyer");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/offer_sent/);
  });

  it("cannot offer when already delivered", () => {
    const r = validateTransition("delivered", "offer", "vendor");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/rfq_sent/);
  });

  it("cannot confirm from rfq_sent", () => {
    const r = validateTransition("rfq_sent", "confirm", "buyer");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/delivered/);
  });
});
