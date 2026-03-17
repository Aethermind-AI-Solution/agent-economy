import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase module before importing crew-runs
const mockFrom = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { from: mockFrom },
}));

const { updateDraftPipeline } = await import("@/lib/crew-runs");

describe("updateDraftPipeline", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("sets contacted_at when moving out of new for first time (contacted_at is null)", async () => {
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { contacted_at: null }, error: null }),
    };
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    mockFrom
      .mockReturnValueOnce(selectChain)  // first call = SELECT
      .mockReturnValueOnce(updateChain); // second call = UPDATE

    await updateDraftPipeline("draft-1", { pipeline_status: "contacted" });

    const updatePayload = updateChain.update.mock.calls[0][0];
    expect(updatePayload.contacted_at).toBeTruthy();
    expect(updatePayload.pipeline_status).toBe("contacted");
  });

  it("does NOT overwrite contacted_at when already set", async () => {
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { contacted_at: "2026-01-01T00:00:00.000Z" }, error: null }),
    };
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    mockFrom
      .mockReturnValueOnce(selectChain)  // first call = SELECT
      .mockReturnValueOnce(updateChain); // second call = UPDATE

    await updateDraftPipeline("draft-1", { pipeline_status: "replied" });

    const updatePayload = updateChain.update.mock.calls[0][0];
    expect(updatePayload.contacted_at).toBeUndefined();
  });

  it("does not set contacted_at when status is 'skipped'", async () => {
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    // Only ONE from() call — no SELECT because shouldSetContacted is false
    mockFrom.mockReturnValueOnce(updateChain);

    await updateDraftPipeline("draft-1", { pipeline_status: "skipped" });

    const updatePayload = updateChain.update.mock.calls[0][0];
    expect(updatePayload.contacted_at).toBeUndefined();
  });
});
