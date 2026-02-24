import { parseUnits } from "viem";
import { resolveWalletEntry } from "../store.js";
import { db } from "../db.js";
import { formatAtomic, type PolicyContext } from "./types.js";

interface ContextExtras {
  requestMethod?: string;
  requestUrl?: string;
  reason?: string;
  now?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Build a PolicyContext by loading wallet state + precomputing aggregates.
 * This is the only function in the policy module that touches the DB.
 */
export async function buildPolicyContext(
  amountAtomic: string,
  service: string,
  decimals: number,
  walletId: string,
  extras?: ContextExtras,
): Promise<PolicyContext> {
  const entry = await resolveWalletEntry(walletId);
  const now = extras?.now ?? new Date();

  // Precompute today's aggregates
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const rows = await db().transaction.findMany({
    where: {
      walletId: entry.id,
      status: { in: ["settled", "settling"] },
      timestamp: { gte: todayStart },
    },
    select: { amount: true },
  });

  let todaySpentAtomic = 0n;
  for (const row of rows) {
    todaySpentAtomic += parseUnits(row.amount, 6);
  }

  const amount = BigInt(amountAtomic);

  return {
    amountAtomic,
    amount,
    decimals,
    amountHuman: formatAtomic(amount, decimals),
    service,

    walletId: entry.id,
    frozen: entry.wallet.frozen,
    rules: entry.rules,
    agentIdentity: entry.agentIdentity,
    tags: entry.tags,

    todaySpentAtomic,
    todayTxCount: rows.length,

    now,
    hourOfDay: now.getHours(),

    requestMethod: extras?.requestMethod,
    requestUrl: extras?.requestUrl,
    reason: extras?.reason,

    metadata: extras?.metadata ?? {},
  };
}
