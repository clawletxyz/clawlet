import { PolicyEngine } from "./engine.js";
import { registerBuiltinRules } from "./rules/index.js";
import { buildPolicyContext } from "./context.js";
import { evaluateAutoApprove } from "./auto-approve.js";
import { db } from "../db.js";
import type {
  PolicyRuleFn,
  PolicyEvaluation,
  PolicyContext,
  AutoApproveConditions,
  AutoApproveResult,
} from "./types.js";

// Re-export all types
export type {
  PolicyContext,
  PolicyDecision,
  PolicyRule,
  PolicyRuleFn,
  PolicyEvaluation,
  RuleTraceEntry,
  AutoApproveConditions,
  AutoApproveResult,
} from "./types.js";
export { formatAtomic } from "./types.js";
export { PolicyEngine } from "./engine.js";
export { buildPolicyContext } from "./context.js";
export { evaluateAutoApprove } from "./auto-approve.js";

// ── Singleton Engine ──────────────────────────────────────────────────

let _engine: PolicyEngine | null = null;

/** Get the singleton PolicyEngine with built-in rules registered. */
export function getEngine(): PolicyEngine {
  if (!_engine) {
    _engine = new PolicyEngine();
    registerBuiltinRules(_engine);
  }
  return _engine;
}

// ── Convenience wrappers ──────────────────────────────────────────────

/** Register a custom rule on the singleton engine. */
export function registerRule(name: string, priority: number, fn: PolicyRuleFn): void {
  getEngine().registerRule(name, priority, fn);
}

/** Unregister a custom rule from the singleton engine. */
export function unregisterRule(name: string): boolean {
  return getEngine().unregisterRule(name);
}

interface EvaluateExtras {
  requestMethod?: string;
  requestUrl?: string;
  reason?: string;
  now?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Full pipeline: build context + evaluate all rules.
 * This is the main entry point for policy evaluation.
 */
export async function evaluatePolicy(
  amountAtomic: string,
  service: string,
  decimals: number,
  walletId: string,
  extras?: EvaluateExtras,
): Promise<PolicyEvaluation> {
  const ctx = await buildPolicyContext(amountAtomic, service, decimals, walletId, extras);
  return getEngine().evaluate(ctx);
}

/**
 * Load a wallet's auto-approve policy from DB and evaluate it against the context.
 * Returns null if no auto-approve policy exists for the wallet.
 */
export async function checkAutoApprove(
  ctx: PolicyContext,
): Promise<AutoApproveResult | null> {
  const row = await db().autoApprovePolicy.findUnique({
    where: { walletId: ctx.walletId },
  });

  if (!row) return null;

  const conditions: AutoApproveConditions = {
    enabled: row.enabled,
    maxAmount: row.maxAmount,
    maxDailyCount: row.maxDailyCount,
    maxDailyAmount: row.maxDailyAmount,
    servicePattern: row.servicePattern,
  };

  return evaluateAutoApprove(conditions, ctx);
}
