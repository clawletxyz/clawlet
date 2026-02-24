import { parseUnits } from "viem";
import type { PolicyRuleFn } from "../types.js";
import { formatAtomic } from "../types.js";

/** Priority 600 — Soft gate: require approval if payment exceeds threshold. */
export const approvalThresholdRule: PolicyRuleFn = (ctx) => {
  if (ctx.rules.requireApprovalAbove === null) return null;

  const threshold = parseUnits(ctx.rules.requireApprovalAbove, ctx.decimals);
  if (ctx.amount > threshold) {
    return {
      decision: "pending_approval",
      reason: `Payment of ${formatAtomic(ctx.amount, ctx.decimals)} USDC exceeds approval threshold of ${ctx.rules.requireApprovalAbove} USDC`,
    };
  }
  return null;
};
