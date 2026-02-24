import { parseUnits } from "viem";
import type { PolicyRuleFn } from "../types.js";
import { formatAtomic } from "../types.js";

/** Priority 300 — Hard block if payment exceeds per-transaction limit. */
export const perTxLimitRule: PolicyRuleFn = (ctx) => {
  if (ctx.rules.maxPerTransaction === null) return null;

  const max = parseUnits(ctx.rules.maxPerTransaction, ctx.decimals);
  if (ctx.amount > max) {
    return {
      decision: "block",
      reason: `Payment of ${formatAtomic(ctx.amount, ctx.decimals)} USDC exceeds per-transaction limit of ${ctx.rules.maxPerTransaction} USDC`,
    };
  }
  return null;
};
