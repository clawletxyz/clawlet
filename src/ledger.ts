import { randomBytes } from "node:crypto";
import { db } from "./db.js";
import { resolveWalletEntry } from "./store.js";
import { toTransactionRecord } from "./mappers.js";
import type { TransactionRecord } from "./types.js";

/** Record a new transaction on a wallet. walletId is required. Returns the record. */
export async function addTransaction(
  params: Omit<TransactionRecord, "id" | "timestamp">,
  idempotencyKey?: string,
  walletId?: string,
): Promise<TransactionRecord> {
  // walletId can still be omitted when called from x402Complete which passes it from the session
  const entry = walletId
    ? await resolveWalletEntry(walletId)
    : (() => { throw new Error("walletId is required for addTransaction"); })();

  // Idempotency: if key provided, check for existing transaction
  if (idempotencyKey) {
    const existing = await db().transaction.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return toTransactionRecord(existing);
    }
  }

  const row = await db().transaction.create({
    data: {
      id: randomBytes(16).toString("hex"),
      walletId: entry.id,
      to: params.to,
      service: params.service,
      amount: params.amount,
      asset: params.asset,
      network: params.network,
      txHash: params.txHash,
      status: params.status,
      reason: params.reason,
      idempotencyKey: idempotencyKey ?? null,
    },
  });

  return toTransactionRecord(row);
}

/** Update a transaction's status and optionally its txHash, reason, or settlement fields. */
export async function updateTransaction(
  id: string,
  update: {
    status?: TransactionRecord["status"];
    txHash?: string;
    reason?: string;
    confirmations?: number;
    confirmedAt?: Date | null;
    lastCheckedBlock?: number;
    settlementFlags?: Record<string, boolean>;
  },
): Promise<TransactionRecord> {
  const data: Record<string, unknown> = {};
  if (update.status) data.status = update.status;
  if (update.txHash) data.txHash = update.txHash;
  if (update.reason) data.reason = update.reason;
  if (update.confirmations !== undefined) data.confirmations = update.confirmations;
  if (update.confirmedAt !== undefined) data.confirmedAt = update.confirmedAt;
  if (update.lastCheckedBlock !== undefined) data.lastCheckedBlock = update.lastCheckedBlock;
  if (update.settlementFlags !== undefined) data.settlementFlags = JSON.stringify(update.settlementFlags);

  const row = await db().transaction.update({
    where: { id },
    data,
  });

  return toTransactionRecord(row);
}

/** Get transactions for a wallet, newest first. walletId is required. */
export async function getTransactions(limit: number = 50, walletId?: string): Promise<TransactionRecord[]> {
  if (!walletId) throw new Error("walletId is required for getTransactions");
  const entry = await resolveWalletEntry(walletId);
  const rows = await db().transaction.findMany({
    where: { walletId: entry.id },
    orderBy: { timestamp: "desc" },
    take: limit,
  });
  return rows.map(toTransactionRecord);
}
