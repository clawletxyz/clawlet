// ── Wallet ──────────────────────────────────────────────────────────

export interface Wallet {
  id: string;
  label: string;
  address: string;
  frozen: boolean;
  adapter: string;
  createdAt: string;
  agentIdentity?: AgentIdentity | null;
  x402scanUrl?: string;
}

// ── Spending Rules ──────────────────────────────────────────────────

export interface SpendingRules {
  maxPerTransaction: string | null;
  dailyCap: string | null;
  allowedServices: string[];
  blockedServices: string[];
}

// ── Transactions ────────────────────────────────────────────────────

export interface Transaction {
  id: string;
  timestamp: string;
  to: string;
  service: string;
  amount: string;
  asset: string;
  network: string;
  txHash: string | null;
  status: "pending" | "settled" | "failed";
  reason: string;
}

// ── Agent Identity ──────────────────────────────────────────────────

export interface AgentIdentity {
  name: string;
  description?: string;
  agentId?: string;
  agentRegistry?: string;
  agentURI?: string;
}

// ── Payment Result ──────────────────────────────────────────────────

export interface PaymentResult {
  status: number;
  body: string;
  payment: {
    txHash: string;
    amount: string;
    service: string;
  } | null;
}

// ── Client Options ──────────────────────────────────────────────────

export interface ClawletOptions {
  /** Base URL of the Clawlet instance (default: "http://localhost:3000") */
  baseUrl?: string;
}

export interface PayOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  reason?: string;
}

export interface CreateWalletOptions {
  adapter?: "local-key" | "privy" | "coinbase-cdp" | "crossmint";
  credentials?: Record<string, string>;
  label?: string;
}
