import { randomBytes } from "node:crypto";
import { persist, requireActiveEntry } from "./store.js";
import type { TransactionRecord } from "./types.js";

/** Record a new transaction on the active wallet. Returns the record. */
export function addTransaction(
  params: Omit<TransactionRecord, "id" | "timestamp">,
): TransactionRecord {
  const entry = requireActiveEntry();
  const record: TransactionRecord = {
    id: randomBytes(16).toString("hex"),
    timestamp: new Date().toISOString(),
    ...params,
  };
  entry.transactions.push(record);
  persist();
  return record;
}

/** Update a transaction's status and optionally its txHash or reason. */
export function updateTransaction(
  id: string,
  update: { status?: TransactionRecord["status"]; txHash?: string; reason?: string },
): TransactionRecord {
  const entry = requireActiveEntry();
  const tx = entry.transactions.find((t) => t.id === id);
  if (!tx) throw new Error(`Transaction ${id} not found`);
  if (update.status) tx.status = update.status;
  if (update.txHash) tx.txHash = update.txHash;
  if (update.reason) tx.reason = update.reason;
  persist();
  return tx;
}

/** Get transactions for the active wallet, newest first. */
export function getTransactions(limit: number = 50): TransactionRecord[] {
  const entry = requireActiveEntry();
  return [...entry.transactions].reverse().slice(0, limit);
}
