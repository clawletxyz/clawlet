import { parseUnits } from "viem";
import type { PolicyRuleFn } from "../types.js";
import { formatAtomic } from "../types.js";

/** Priority 400 — Hard block if payment would exceed daily spending cap. */
export const dailyCapRule: PolicyRuleFn = (ctx) => {
  if (ctx.rules.dailyCap === null) return null;

  const cap = parseUnits(ctx.rules.dailyCap, ctx.decimals);
  if (ctx.todaySpentAtomic + ctx.amount > cap) {
    return {
      decision: "block",
      reason: `Payment would exceed daily cap of ${ctx.rules.dailyCap} USDC (already spent ${formatAtomic(ctx.todaySpentAtomic, ctx.decimals)} today)`,
    };
  }
  return null;
};
