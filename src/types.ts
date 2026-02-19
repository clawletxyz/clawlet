import type { Address, Hex } from "viem";
import type { AdapterConfig } from "./adapters/types.js";

// ── Wallet ──────────────────────────────────────────────────────────

export interface WalletInfo {
  address: Address;
  createdAt: string;
  frozen: boolean;
}

// ── Spending Rules ──────────────────────────────────────────────────

export interface SpendingRules {
  /** Max USDC per single transaction (human-readable, e.g. "5.00") */
  maxPerTransaction: string | null;
  /** Max USDC spend per calendar day */
  dailyCap: string | null;
  /** If set, only these domains/addresses can be paid */
  allowedServices: string[];
  /** If set, these domains/addresses are always blocked (checked before allowlist) */
  blockedServices: string[];
}

export const DEFAULT_RULES: SpendingRules = {
  maxPerTransaction: null,
  dailyCap: null,
  allowedServices: [],
  blockedServices: [],
};

// ── Transaction Ledger ──────────────────────────────────────────────

export interface TransactionRecord {
  id: string;
  timestamp: string;
  to: Address;
  service: string;
  amount: string;
  asset: string;
  network: string;
  txHash: string | null;
  status: "pending" | "settled" | "failed";
  reason: string;
}

// ── Agent Identity (ERC-8004) ────────────────────────────────────────

export interface AgentIdentity {
  /** Agent name (human-readable) */
  name: string;
  /** Optional description of the agent's purpose */
  description?: string;
  /** ERC-8004 agentId (tokenId) — set after on-chain registration */
  agentId?: string;
  /** ERC-8004 agentRegistry — e.g. "eip155:8453:0x8004A169..." */
  agentRegistry?: string;
  /** agentURI pointing to metadata (ipfs:// or https://) */
  agentURI?: string;
}

// ── Multi-Wallet Entry ──────────────────────────────────────────────

export interface WalletEntry {
  id: string;
  label: string;
  wallet: WalletInfo;
  adapterConfig: AdapterConfig;
  rules: SpendingRules;
  transactions: TransactionRecord[];
  /** Optional ERC-8004 agent identity bound to this wallet */
  agentIdentity?: AgentIdentity;
}

// ── Network ─────────────────────────────────────────────────────────

export type NetworkId = "base" | "base-sepolia";

// ── x402 Protocol Types ─────────────────────────────────────────────

export interface PaymentRequired {
  x402Version: number;
  error?: string;
  accepts: PaymentRequirements[];
  resource?: ResourceInfo;
}

export interface ResourceInfo {
  url: string;
  description?: string;
}

export interface PaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: Address;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}

export interface PaymentPayload {
  x402Version: number;
  resource?: ResourceInfo;
  accepted: PaymentRequirements;
  payload: ExactEvmPayload;
}

export interface ExactEvmPayload {
  signature: Hex;
  authorization: {
    from: Address;
    to: Address;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: Hex;
  };
}

// ── Persisted State (v2 — multi-wallet) ─────────────────────────────

export interface ClawletState {
  wallets: WalletEntry[];
  activeWalletId: string | null;
  network: NetworkId;
}

// ── Legacy State (v1 — single-wallet, for migration) ───────────────

export interface LegacyClawletState {
  adapterConfig: AdapterConfig | null;
  wallet: WalletInfo | null;
  rules: SpendingRules;
  transactions: TransactionRecord[];
}
