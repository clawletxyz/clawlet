import { parseUnits } from "viem";
import { persist, requireActiveEntry } from "./store.js";
import type { SpendingRules } from "./types.js";

/** Update spending rules on the active wallet (partial update). */
export function setRules(patch: Partial<SpendingRules>): SpendingRules {
  const entry = requireActiveEntry();
  const rules = entry.rules;
  if (patch.maxPerTransaction !== undefined) rules.maxPerTransaction = patch.maxPerTransaction;
  if (patch.dailyCap !== undefined) rules.dailyCap = patch.dailyCap;
  if (patch.allowedServices !== undefined) rules.allowedServices = patch.allowedServices;
  if (patch.blockedServices !== undefined) rules.blockedServices = patch.blockedServices;
  persist();
  return rules;
}

/** Get current spending rules for the active wallet. */
export function getRules(): SpendingRules {
  return requireActiveEntry().rules;
}

/**
 * Enforce spending rules before a payment.
 * Throws an error string if the payment violates any rule.
 */
export function enforceRules(
  amountAtomic: string,
  service: string,
  decimals: number = 6,
): void {
  const entry = requireActiveEntry();
  const rules = entry.rules;
  const amount = BigInt(amountAtomic);

  // Check per-transaction limit
  if (rules.maxPerTransaction !== null) {
    const max = parseUnits(rules.maxPerTransaction, decimals);
    if (amount > max) {
      throw new Error(
        `Payment of ${formatAtomic(amount, decimals)} USDC exceeds per-transaction limit of ${rules.maxPerTransaction} USDC`,
      );
    }
  }

  // Check daily cap
  if (rules.dailyCap !== null) {
    const cap = parseUnits(rules.dailyCap, decimals);
    const todaySpent = getTodaySpent(entry.transactions);
    if (todaySpent + amount > cap) {
      throw new Error(
        `Payment would exceed daily cap of ${rules.dailyCap} USDC (already spent ${formatAtomic(todaySpent, decimals)} today)`,
      );
    }
  }

  // Check service blocklist (takes precedence over allowlist)
  if (rules.blockedServices.length > 0) {
    const normalized = service.toLowerCase();
    const blocked = rules.blockedServices.some(
      (s) => normalized.includes(s.toLowerCase()),
    );
    if (blocked) {
      throw new Error(
        `Service "${service}" is blocked. Blocked services: ${rules.blockedServices.join(", ")}`,
      );
    }
  }

  // Check service allowlist
  if (rules.allowedServices.length > 0) {
    const normalized = service.toLowerCase();
    const allowed = rules.allowedServices.some(
      (s) => normalized.includes(s.toLowerCase()),
    );
    if (!allowed) {
      throw new Error(
        `Service "${service}" is not in the allowed services list: ${rules.allowedServices.join(", ")}`,
      );
    }
  }
}

function getTodaySpent(transactions: { status: string; timestamp: string; amount: string }[]): bigint {
  const today = new Date().toISOString().slice(0, 10);
  let total = 0n;
  for (const tx of transactions) {
    if (tx.status === "settled" && tx.timestamp.startsWith(today)) {
      total += parseUnits(tx.amount, 6);
    }
  }
  return total;
}

function formatAtomic(value: bigint, decimals: number): string {
  const str = value.toString().padStart(decimals + 1, "0");
  const whole = str.slice(0, str.length - decimals) || "0";
  const frac = str.slice(str.length - decimals);
  return `${whole}.${frac}`;
}
