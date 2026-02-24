import type { RuleDecisionType, SpendingRules, AgentIdentity } from "../types.js";

// Re-export for convenience
export type { RuleDecisionType, SpendingRules, AgentIdentity };

// ── Policy Context ────────────────────────────────────────────────────

export interface PolicyContext {
  // Payment
  amountAtomic: string;
  amount: bigint;
  decimals: number;
  amountHuman: string;
  service: string;

  // Wallet state
  walletId: string;
  frozen: boolean;
  rules: SpendingRules;
  agentIdentity?: AgentIdentity;
  tags?: Record<string, string>;

  // Precomputed aggregates
  todaySpentAtomic: bigint;
  todayTxCount: number;

  // Temporal (injected for testability)
  now: Date;
  hourOfDay: number;

  // Request metadata
  requestMethod?: string;
  requestUrl?: string;
  reason?: string;

  // Extensibility bag
  metadata: Record<string, unknown>;
}

// ── Policy Decision ───────────────────────────────────────────────────

export interface PolicyDecision {
  decision: RuleDecisionType;
  reason: string;
  ruleName?: string;
}

// ── Rule Function ─────────────────────────────────────────────────────

export type PolicyRuleFn = (ctx: PolicyContext) => Promise<PolicyDecision | null> | PolicyDecision | null;

export interface PolicyRule {
  name: string;
  priority: number;
  fn: PolicyRuleFn;
  builtin?: boolean;
}

// ── Rule Trace ────────────────────────────────────────────────────────

export interface RuleTraceEntry {
  ruleName: string;
  priority: number;
  decision: RuleDecisionType | "pass";
  reason?: string;
  durationMs: number;
}

// ── Policy Evaluation Result ──────────────────────────────────────────

export interface PolicyEvaluation {
  decision: PolicyDecision;
  trace: RuleTraceEntry[];
  ctx: PolicyContext;
}

// ── Auto-Approve ──────────────────────────────────────────────────────

export interface AutoApproveConditions {
  enabled: boolean;
  maxAmount?: string | null;
  maxDailyCount?: number | null;
  maxDailyAmount?: string | null;
  servicePattern?: string | null;
}

export interface AutoApproveResult {
  approved: boolean;
  failedConditions: string[];
}

// ── Utility ───────────────────────────────────────────────────────────

export function formatAtomic(value: bigint, decimals: number): string {
  const str = value.toString().padStart(decimals + 1, "0");
  const whole = str.slice(0, str.length - decimals) || "0";
  const frac = str.slice(str.length - decimals);
  return `${whole}.${frac}`;
}
