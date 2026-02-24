import type { PolicyEngine } from "../engine.js";
import { frozenRule } from "./frozen.js";
import { blocklistRule } from "./blocklist.js";
import { perTxLimitRule } from "./per-tx-limit.js";
import { dailyCapRule } from "./daily-cap.js";
import { allowlistRule } from "./allowlist.js";
import { approvalThresholdRule } from "./approval-threshold.js";

/** Register all built-in policy rules on an engine instance. */
export function registerBuiltinRules(engine: PolicyEngine): void {
  engine.registerRule("frozen", 100, frozenRule, true);
  engine.registerRule("blocklist", 200, blocklistRule, true);
  engine.registerRule("per-tx-limit", 300, perTxLimitRule, true);
  engine.registerRule("daily-cap", 400, dailyCapRule, true);
  engine.registerRule("allowlist", 500, allowlistRule, true);
  engine.registerRule("approval-threshold", 600, approvalThresholdRule, true);
}
