import type {
  ClawletOptions,
  CreateWalletOptions,
  PayOptions,
  PaymentResult,
  SpendingRules,
  Transaction,
  Wallet,
  AgentIdentity,
} from "./types.js";

export class Clawlet {
  private baseUrl: string;

  constructor(options?: ClawletOptions | string) {
    if (typeof options === "string") {
      this.baseUrl = options.replace(/\/$/, "");
    } else {
      this.baseUrl = (options?.baseUrl ?? "http://localhost:3000").replace(/\/$/, "");
    }
  }

  // ── Wallets ─────────────────────────────────────────────────────

  async createWallet(options?: CreateWalletOptions): Promise<Wallet> {
    return this.post("/api/wallets", {
      adapter: options?.adapter ?? "local-key",
      credentials: options?.credentials ?? {},
      label: options?.label,
    });
  }

  async listWallets(): Promise<{ wallets: Wallet[]; activeWalletId: string | null }> {
    return this.get("/api/wallets");
  }

  async switchWallet(walletId: string): Promise<{ activeWalletId: string; label: string }> {
    return this.post("/api/wallets/switch", { walletId });
  }

  async getWallet(): Promise<Wallet> {
    return this.get("/api/wallet");
  }

  async deleteWallet(walletId: string): Promise<{ deleted: string }> {
    return this.request("DELETE", `/api/wallets/${walletId}`);
  }

  // ── Balance ─────────────────────────────────────────────────────

  async getBalance(network?: "base" | "base-sepolia"): Promise<{ balance: string; network: string }> {
    const params = network ? `?network=${network}` : "";
    return this.get(`/api/balance${params}`);
  }

  // ── Rules ───────────────────────────────────────────────────────

  async getRules(): Promise<SpendingRules> {
    return this.get("/api/rules");
  }

  async setRules(rules: Partial<SpendingRules>): Promise<SpendingRules> {
    return this.request("PUT", "/api/rules", rules);
  }

  // ── Payments ────────────────────────────────────────────────────

  async pay(url: string, options?: PayOptions): Promise<PaymentResult> {
    return this.post("/api/pay", {
      url,
      method: options?.method ?? "GET",
      headers: options?.headers,
      body: options?.body,
      reason: options?.reason ?? "clawlet sdk payment",
    });
  }

  /**
   * Alias for `pay()` — matches the clawlet.fetch(url, opts) convention.
   */
  async fetch(url: string, options?: PayOptions): Promise<PaymentResult> {
    return this.pay(url, options);
  }

  // ── Transactions ────────────────────────────────────────────────

  async getTransactions(limit?: number): Promise<{ count: number; transactions: Transaction[] }> {
    const params = limit ? `?limit=${limit}` : "";
    return this.get(`/api/transactions${params}`);
  }

  // ── Freeze / Unfreeze ───────────────────────────────────────────

  async freeze(): Promise<{ frozen: boolean }> {
    return this.post("/api/freeze");
  }

  async unfreeze(): Promise<{ frozen: boolean }> {
    return this.post("/api/unfreeze");
  }

  // ── Network ─────────────────────────────────────────────────────

  async getNetwork(): Promise<{ network: string }> {
    return this.get("/api/network");
  }

  async setNetwork(network: "base" | "base-sepolia"): Promise<{ network: string }> {
    return this.post("/api/network", { network });
  }

  // ── Agent Identity ──────────────────────────────────────────────

  async getAgentIdentity(): Promise<{ identity: AgentIdentity | null }> {
    return this.get("/api/agent-identity");
  }

  async setAgentIdentity(identity: AgentIdentity): Promise<{ identity: AgentIdentity }> {
    return this.post("/api/agent-identity", identity);
  }

  // ── HTTP helpers ────────────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    return this.request("GET", path);
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request("POST", path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
    };

    if (body !== undefined && method !== "GET") {
      init.body = JSON.stringify(body);
    }

    const res = await globalThis.fetch(url, init);

    if (!res.ok) {
      const errorBody = await res.text();
      let message: string;
      try {
        message = JSON.parse(errorBody).error ?? errorBody;
      } catch {
        message = errorBody;
      }
      throw new ClawletError(message, res.status, path);
    }

    return res.json() as Promise<T>;
  }
}

export class ClawletError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
  ) {
    super(`Clawlet API error (${status} ${path}): ${message}`);
    this.name = "ClawletError";
  }
}
