import type {
  PolicyContext,
  PolicyDecision,
  PolicyRule,
  PolicyRuleFn,
  PolicyEvaluation,
  RuleTraceEntry,
} from "./types.js";

export class PolicyEngine {
  private rules: PolicyRule[] = [];

  registerRule(name: string, priority: number, fn: PolicyRuleFn, builtin?: boolean): void {
    // Replace existing rule with the same name
    this.rules = this.rules.filter((r) => r.name !== name);
    this.rules.push({ name, priority, fn, builtin });
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  unregisterRule(name: string): boolean {
    const rule = this.rules.find((r) => r.name === name);
    if (!rule) return false;
    if (rule.builtin) return false;
    this.rules = this.rules.filter((r) => r.name !== name);
    return true;
  }

  listRules(): ReadonlyArray<{ name: string; priority: number; builtin: boolean }> {
    return this.rules.map((r) => ({
      name: r.name,
      priority: r.priority,
      builtin: r.builtin ?? false,
    }));
  }

  async evaluate(ctx: PolicyContext): Promise<PolicyEvaluation> {
    const trace: RuleTraceEntry[] = [];

    for (const rule of this.rules) {
      const start = performance.now();
      const result = await rule.fn(ctx);
      const durationMs = performance.now() - start;

      if (result !== null) {
        // Terminal decision — stamp the rule name
        const decision: PolicyDecision = {
          ...result,
          ruleName: rule.name,
        };
        trace.push({
          ruleName: rule.name,
          priority: rule.priority,
          decision: result.decision,
          reason: result.reason,
          durationMs,
        });
        return { decision, trace, ctx };
      }

      // null = "no opinion, pass"
      trace.push({
        ruleName: rule.name,
        priority: rule.priority,
        decision: "pass",
        durationMs,
      });
    }

    // All rules passed — allow
    const decision: PolicyDecision = {
      decision: "allow",
      reason: "All rules passed",
      ruleName: "default",
    };
    return { decision, trace, ctx };
  }
}
