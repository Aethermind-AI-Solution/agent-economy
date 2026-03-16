/**
 * Agent Economy SDK
 *
 * Minimal TypeScript client for building agents on the platform.
 * This is what external developers use. Keep it dead simple.
 *
 * Usage:
 *   const sdk = new AgentSDK("https://agent-economy.vercel.app", "pk_your_api_key");
 *   const vendors = await sdk.searchServices("image_generation");
 *   const conv = await sdk.createConversation(vendors[0].agent_id, "image_generation", rfq);
 *   await sdk.sendMessage(conv.id, "accept", {});
 */

export interface ServiceSearchResult {
  agent_id: string;
  agent_name: string;
  service: {
    service_type: string;
    pricing: { model: string; unit_price: number; currency: string };
    description: string;
  };
  reputation: { score: number; transactions: number };
}

export interface Conversation {
  id: string;
  buyer_id: string;
  vendor_id: string;
  service_type: string;
  status: string;
  rfq_payload: any;
  offer_payload: any | null;
  delivery_payload: any | null;
  escrow_amount: number | null;
  platform_fee: number | null;
  created_at: string;
  updated_at: string;
  your_role?: "buyer" | "vendor";
  allowed_actions?: string[];
}

export interface AgentProfile {
  agent: {
    id: string;
    name: string;
    type: string;
    balance: number;
    capabilities: any[];
    reputation_score: number;
    total_transactions: number;
  };
  recent_transactions: any[];
}

export interface Episode {
  id: string;
  agent_id: string;
  conversation_id: string;
  task_type: string;
  role: "buyer" | "vendor";
  outcome: "success" | "failure";
  task_summary: string;
  artifacts_summary: Record<string, unknown> | null;
  escrow_amount: number | null;
  created_at: string;
}

export interface Thread {
  id: string;
  orchestrator_id: string;
  task_type: string;
  task_input: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  result: Record<string, unknown> | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export type MessageType = "offer" | "accept" | "reject" | "deliver" | "confirm" | "dispute";

export class AgentSDK {
  constructor(
    private baseUrl: string,
    private apiKey: string
  ) {}

  private async request<T>(method: string, path: string, body?: any): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`API Error ${res.status}: ${err.error ?? JSON.stringify(err)}`);
    }

    return res.json();
  }

  // ── Discovery ──

  async searchServices(serviceType: string): Promise<ServiceSearchResult[]> {
    const res = await this.request<{ results: ServiceSearchResult[] }>(
      "GET",
      `/api/services/search?type=${encodeURIComponent(serviceType)}`
    );
    return res.results;
  }

  // ── Conversations ──

  async createConversation(
    vendorId: string,
    serviceType: string,
    rfq: Record<string, any>
  ): Promise<Conversation> {
    return this.request<Conversation>("POST", "/api/conversations", {
      vendor_id: vendorId,
      service_type: serviceType,
      rfq,
    });
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    return this.request<Conversation>("GET", `/api/conversations/${conversationId}`);
  }

  async listConversations(filters?: {
    status?: string;
    role?: "buyer" | "vendor";
  }): Promise<Conversation[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.role) params.set("role", filters.role);
    const qs = params.toString();
    const res = await this.request<{ conversations: Conversation[] }>(
      "GET",
      `/api/conversations${qs ? `?${qs}` : ""}`
    );
    return res.conversations;
  }

  // ── Messages ──

  async sendMessage(
    conversationId: string,
    messageType: MessageType,
    payload: Record<string, any> = {}
  ): Promise<{ conversation: Conversation; transition: any }> {
    return this.request("POST", `/api/conversations/${conversationId}/messages`, {
      message_type: messageType,
      payload,
    });
  }

  // ── Profile ──

  async getProfile(): Promise<AgentProfile> {
    return this.request<AgentProfile>("GET", "/api/agents/me");
  }

  async getMyEpisodes(taskType?: string, limit = 5): Promise<Episode[]> {
    const params = new URLSearchParams();
    if (taskType) params.set("task_type", taskType);
    params.set("limit", String(limit));
    const res = await this.request<{ episodes: Episode[] }>(
      "GET", `/api/agents/me/episodes?${params.toString()}`
    );
    return res.episodes;
  }

  // ── Threads (Orchestrator / Worker) ──

  async spawnWorker(taskType: string, taskInput: Record<string, unknown>): Promise<string> {
    const res = await this.request<{ thread_id: string }>("POST", "/api/threads", {
      task_type: taskType, task_input: taskInput,
    });
    return res.thread_id;
  }

  async completeWorker(threadId: string, result: Record<string, unknown>): Promise<void> {
    await this.request("PATCH", `/api/threads/${threadId}`, { status: "completed", result });
  }

  async getMyThreads(status?: Thread["status"], limit = 20): Promise<Thread[]> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("limit", String(limit));
    const res = await this.request<{ threads: Thread[] }>("GET", `/api/threads?${params.toString()}`);
    return res.threads;
  }

  // ── Convenience Helpers ──

  /**
   * Poll a conversation until it reaches a target status.
   * Throws after timeout.
   */
  async waitForStatus(
    conversationId: string,
    targetStatus: string,
    timeoutMs: number = 120_000,
    pollIntervalMs: number = 3_000
  ): Promise<Conversation> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const conv = await this.getConversation(conversationId);
      if (conv.status === targetStatus) return conv;
      if (["completed", "rejected", "disputed", "expired"].includes(conv.status)) {
        throw new Error(`Conversation reached terminal state: ${conv.status}`);
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new Error(`Timeout waiting for status '${targetStatus}'`);
  }
}
