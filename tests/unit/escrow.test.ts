import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase module before importing escrow
const mockRpc = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mockRpc },
}));

const { createEscrow, releaseEscrow, freezeEscrow } = await import("@/lib/escrow");

describe("createEscrow", () => {
  beforeEach(() => { mockRpc.mockReset(); });

  it("returns success when RPC succeeds", async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });
    const result = await createEscrow("conv-1", "buyer-1", 10.0);
    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("create_escrow", {
      p_conversation_id: "conv-1",
      p_buyer_id: "buyer-1",
      p_amount: 10.0,
    });
  });

  it("returns error when RPC fails", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Insufficient balance" } });
    const result = await createEscrow("conv-1", "buyer-1", 999.0);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Insufficient balance");
  });
});

describe("releaseEscrow", () => {
  beforeEach(() => { mockRpc.mockReset(); });

  it("calls release_escrow RPC and returns success", async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });
    const result = await releaseEscrow("conv-2");
    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("release_escrow", { p_conversation_id: "conv-2" });
  });

  it("returns error when vendor credit fails", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Conversation not found" } });
    const result = await releaseEscrow("bad-conv");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Conversation not found");
  });
});

describe("freezeEscrow", () => {
  beforeEach(() => { mockRpc.mockReset(); });

  it("calls freeze_escrow RPC (no balance mutation)", async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });
    const result = await freezeEscrow("conv-3");
    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("freeze_escrow", { p_conversation_id: "conv-3" });
    // freeze does not mutate balances — verify no other RPC calls
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
