import type {
  Wallet as PrismaWallet,
  Transaction as PrismaTransaction,
  PaymentSession as PrismaPaymentSession,
  ApprovalRequest as PrismaApprovalRequest,
} from "./generated/prisma/client.js";
import type { Address } from "viem";
import type {
  WalletEntry,
  WalletInfo,
  SpendingRules,
  TransactionRecord,
  AgentIdentity,
  PaymentRequired,
  PaymentRequirements,
  ExactEvmPayload,
} from "./types.js";
import type { AdapterConfig } from "./adapters/types.js";

// ── Wallet mappers ──────────────────────────────────────────────────

export function toWalletEntry(
  row: PrismaWallet & { transactions?: PrismaTransaction[] },
): WalletEntry {
  const wallet: WalletInfo = {
    address: row.address as Address,
    createdAt: row.createdAt.toISOString(),
    frozen: row.frozen,
  };

  const rules: SpendingRules = {
    maxPerTransaction: row.maxPerTransaction,
    dailyCap: row.dailyCap,
    requireApprovalAbove: row.requireApprovalAbove,
    allowedServices: JSON.parse(row.allowedServices) as string[],
    blockedServices: JSON.parse(row.blockedServices) as string[],
  };

  const agentIdentity: AgentIdentity | undefined =
    row.agentName
      ? {
          name: row.agentName,
          description: row.agentDescription ?? undefined,
          agentId: row.agentId ?? undefined,
          agentRegistry: row.agentRegistry ?? undefined,
          agentURI: row.agentURI ?? undefined,
        }
      : undefined;

  const transactions: TransactionRecord[] = (row.transactions ?? []).map(
    toTransactionRecord,
  );

  const tags = JSON.parse((row as any).tags ?? "{}") as Record<string, string>;

  return {
    id: row.id,
    label: row.label,
    wallet,
    adapterConfig: JSON.parse(row.adapterConfig) as AdapterConfig,
    rules,
    transactions,
    agentIdentity,
    tags,
  };
}

export function fromWalletEntry(entry: WalletEntry) {
  return {
    id: entry.id,
    label: entry.label,
    address: entry.wallet.address,
    createdAt: new Date(entry.wallet.createdAt),
    frozen: entry.wallet.frozen,
    adapterType: entry.adapterConfig.type,
    adapterConfig: JSON.stringify(entry.adapterConfig),
    maxPerTransaction: entry.rules.maxPerTransaction,
    dailyCap: entry.rules.dailyCap,
    requireApprovalAbove: entry.rules.requireApprovalAbove,
    allowedServices: JSON.stringify(entry.rules.allowedServices),
    blockedServices: JSON.stringify(entry.rules.blockedServices),
    agentName: entry.agentIdentity?.name ?? null,
    agentDescription: entry.agentIdentity?.description ?? null,
    agentId: entry.agentIdentity?.agentId ?? null,
    agentRegistry: entry.agentIdentity?.agentRegistry ?? null,
    agentURI: entry.agentIdentity?.agentURI ?? null,
    tags: JSON.stringify(entry.tags ?? {}),
  };
}

// ── Transaction mappers ─────────────────────────────────────────────

export function toTransactionRecord(row: PrismaTransaction): TransactionRecord {
  let settlementFlags: Record<string, boolean> | undefined;
  try {
    const parsed = JSON.parse((row as any).settlementFlags ?? "{}");
    if (Object.keys(parsed).length > 0) settlementFlags = parsed;
  } catch { /* ignore */ }

  return {
    id: row.id,
    timestamp: row.timestamp.toISOString(),
    to: row.to as Address,
    service: row.service,
    amount: row.amount,
    asset: row.asset,
    network: row.network,
    txHash: row.txHash,
    status: row.status as TransactionRecord["status"],
    reason: row.reason,
    ...(row.idempotencyKey ? { idempotencyKey: row.idempotencyKey } : {}),
    confirmations: (row as any).confirmations ?? 0,
    confirmedAt: (row as any).confirmedAt?.toISOString?.() ?? null,
    ...(settlementFlags ? { settlementFlags } : {}),
  };
}

// ── PaymentSession mappers ──────────────────────────────────────────

export interface AppPaymentSession {
  id: string;
  walletId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  reason: string;
  accepted: PaymentRequirements;
  paymentRequired: PaymentRequired;
  authorization: ExactEvmPayload["authorization"];
  txRecordId: string;
  expiresAt: number;
}

export function toPaymentSession(row: PrismaPaymentSession): AppPaymentSession {
  return {
    id: row.id,
    walletId: row.walletId,
    url: row.url,
    method: row.method,
    headers: JSON.parse(row.headers) as Record<string, string>,
    body: row.body ?? undefined,
    reason: row.reason,
    accepted: JSON.parse(row.accepted) as PaymentRequirements,
    paymentRequired: JSON.parse(row.paymentRequired) as PaymentRequired,
    authorization: JSON.parse(row.authorization) as ExactEvmPayload["authorization"],
    txRecordId: row.txRecordId,
    expiresAt: row.expiresAt,
  };
}

// ── ApprovalRequest mappers ───────────────────────────────────────

export interface AppApprovalRequest {
  id: string;
  walletId: string;
  agentName: string | null;
  url: string;
  method: string;
  amount: string;
  asset: string;
  network: string;
  reason: string;
  ruleTriggered: string;
  status: "pending" | "approved" | "rejected" | "expired";
  decidedBy: string | null;
  decidedAt: string | null;
  expiresAt: string;
  createdAt: string;
  // Stored negotiation context for resuming payment
  requestHeaders: Record<string, string>;
  requestBody?: string;
  accepted: PaymentRequirements;
  paymentRequired: PaymentRequired;
}

export function toApprovalRequest(row: PrismaApprovalRequest): AppApprovalRequest {
  return {
    id: row.id,
    walletId: row.walletId,
    agentName: row.agentName,
    url: row.url,
    method: row.method,
    amount: row.amount,
    asset: row.asset,
    network: row.network,
    reason: row.reason,
    ruleTriggered: row.ruleTriggered,
    status: row.status as AppApprovalRequest["status"],
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    requestHeaders: JSON.parse(row.requestHeaders) as Record<string, string>,
    requestBody: row.requestBody ?? undefined,
    accepted: JSON.parse(row.accepted) as PaymentRequirements,
    paymentRequired: JSON.parse(row.paymentRequired) as PaymentRequired,
  };
}
