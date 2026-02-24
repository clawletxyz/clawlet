import { db } from "./db.js";
import { resolveWalletEntry } from "./store.js";
import { evaluatePolicy } from "./policy/index.js";
import type { SpendingRules, RuleDecision } from "./types.js";

/** Update spending rules on a wallet (partial update). */
export async function setRules(patch: Partial<SpendingRules>, walletId: string): Promise<SpendingRules> {
  const entry = await resolveWalletEntry(walletId);

  const data: Record<string, unknown> = {};
  if (patch.maxPerTransaction !== undefined) data.maxPerTransaction = patch.maxPerTransaction;
  if (patch.dailyCap !== undefined) data.dailyCap = patch.dailyCap;
  if (patch.requireApprovalAbove !== undefined) data.requireApprovalAbove = patch.requireApprovalAbove;
  if (patch.allowedServices !== undefined) data.allowedServices = JSON.stringify(patch.allowedServices);
  if (patch.blockedServices !== undefined) data.blockedServices = JSON.stringify(patch.blockedServices);

  const updated = await db().wallet.update({
    where: { id: entry.id },
    data,
  });

  return {
    maxPerTransaction: updated.maxPerTransaction,
    dailyCap: updated.dailyCap,
    requireApprovalAbove: updated.requireApprovalAbove,
    allowedServices: JSON.parse(updated.allowedServices) as string[],
    blockedServices: JSON.parse(updated.blockedServices) as string[],
  };
}

/** Get current spending rules for a wallet. */
export async function getRules(walletId: string): Promise<SpendingRules> {
  const entry = await resolveWalletEntry(walletId);
  return entry.rules;
}

/**
 * Evaluate spending rules for a payment.
 * Thin wrapper over the pluggable policy engine — preserves the original API.
 */
export async function evaluateRules(
  amountAtomic: string,
  service: string,
  decimals: number = 6,
  walletId: string,
): Promise<RuleDecision> {
  const evaluation = await evaluatePolicy(amountAtomic, service, decimals, walletId);
  return { decision: evaluation.decision.decision, reason: evaluation.decision.reason };
}

/**
 * Enforce spending rules before a payment (legacy wrapper).
 * Throws on block. Returns normally on allow.
 * Does NOT handle pending_approval — callers that need approval support should use evaluateRules.
 */
export async function enforceRules(
  amountAtomic: string,
  service: string,
  decimals: number = 6,
  walletId: string,
): Promise<void> {
  const decision = await evaluateRules(amountAtomic, service, decimals, walletId);
  if (decision.decision === "block") {
    throw new Error(decision.reason);
  }
  // pending_approval is treated as allow in legacy flow (for backwards compat with browser wallet flow)
}
