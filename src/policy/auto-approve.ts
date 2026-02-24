import { parseUnits } from "viem";
import type { PolicyContext, AutoApproveConditions, AutoApproveResult } from "./types.js";

/**
 * Simple glob matcher: supports `*` as wildcard.
 * e.g. "*.example.com" matches "api.example.com"
 */
function matchGlob(pattern: string, value: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

/**
 * Pure function: evaluate auto-approve conditions against a PolicyContext.
 * All non-null conditions must pass (AND logic).
 */
export function evaluateAutoApprove(
  conditions: AutoApproveConditions,
  ctx: PolicyContext,
): AutoApproveResult {
  if (!conditions.enabled) {
    return { approved: false, failedConditions: ["disabled"] };
  }

  const failedConditions: string[] = [];

  // maxAmount — per-tx ceiling for auto-approve
  if (conditions.maxAmount != null) {
    const max = parseUnits(conditions.maxAmount, ctx.decimals);
    if (ctx.amount > max) {
      failedConditions.push(
        `amount ${ctx.amountHuman} exceeds auto-approve max of ${conditions.maxAmount}`,
      );
    }
  }

  // maxDailyCount — max auto-approved txs per day
  if (conditions.maxDailyCount != null) {
    if (ctx.todayTxCount >= conditions.maxDailyCount) {
      failedConditions.push(
        `daily tx count ${ctx.todayTxCount} has reached auto-approve limit of ${conditions.maxDailyCount}`,
      );
    }
  }

  // maxDailyAmount — cumulative daily ceiling
  if (conditions.maxDailyAmount != null) {
    const maxDaily = parseUnits(conditions.maxDailyAmount, ctx.decimals);
    if (ctx.todaySpentAtomic + ctx.amount > maxDaily) {
      failedConditions.push(
        `daily total would exceed auto-approve daily cap of ${conditions.maxDailyAmount}`,
      );
    }
  }

  // servicePattern — glob match on hostname
  if (conditions.servicePattern != null) {
    if (!matchGlob(conditions.servicePattern, ctx.service)) {
      failedConditions.push(
        `service "${ctx.service}" does not match pattern "${conditions.servicePattern}"`,
      );
    }
  }

  return {
    approved: failedConditions.length === 0,
    failedConditions,
  };
}
