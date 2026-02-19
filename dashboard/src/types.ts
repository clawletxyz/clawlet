export interface WalletInfo {
  address: string;
  createdAt: string;
  frozen: boolean;
}

export interface SpendingRules {
  maxPerTransaction: string | null;
  dailyCap: string | null;
  allowedServices: string[];
  blockedServices: string[];
}

export interface TransactionRecord {
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

export interface AgentIdentity {
  name: string;
  description?: string;
  agentId?: string;
  agentRegistry?: string;
  agentURI?: string;
}

export interface WalletSummary {
  id: string;
  label: string;
  address: string;
  frozen: boolean;
  adapter: string;
  createdAt: string;
  agentIdentity: AgentIdentity | null;
  x402scanUrl: string;
}

export type NetworkId = "base" | "base-sepolia";
