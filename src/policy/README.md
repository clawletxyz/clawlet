# Policy Engine (`src/policy/`)

Pluggable spending-rule evaluation pipeline for Clawlet wallets. Replaces the inline if-block logic that was previously in `src/rules.ts`.

## Architecture

```
evaluatePolicy(amount, service, decimals, walletId)
        │
        ▼
  buildPolicyContext()      ← only DB-touching function
        │
        ▼
  PolicyEngine.evaluate()   ← pure pipeline, no side effects
        │
   ┌────┴────────────────────────────────────┐
   │  frozen (100)                           │
   │  blocklist (200)                        │
   │  per-tx-limit (300)                     │
   │  daily-cap (400)          sorted by     │
   │  allowlist (500)          priority      │
   │  approval-threshold (600)               │
   └────┬────────────────────────────────────┘
        │
        ▼
  PolicyEvaluation { decision, trace, ctx }
```

## Files

| File | Purpose |
|---|---|
| `types.ts` | All interfaces: `PolicyContext`, `PolicyDecision`, `PolicyRule`, `PolicyEvaluation`, `AutoApproveConditions`, `AutoApproveResult`, `formatAtomic()` |
| `engine.ts` | `PolicyEngine` class — rule registry, sorted pipeline runner, trace builder |
| `context.ts` | `buildPolicyContext()` — loads wallet state + precomputes daily aggregates from DB |
| `auto-approve.ts` | `evaluateAutoApprove()` — pure AND-logic function for auto-approve conditions |
| `index.ts` | Public API: `getEngine()`, `evaluatePolicy()`, `checkAutoApprove()`, `registerRule()`, `unregisterRule()` |
| `rules/frozen.ts` | Priority 100 — hard block if wallet is frozen |
| `rules/blocklist.ts` | Priority 200 — hard block if service is on blocklist |
| `rules/per-tx-limit.ts` | Priority 300 — hard block if amount exceeds per-tx limit |
| `rules/daily-cap.ts` | Priority 400 — hard block if daily cap would be exceeded |
| `rules/allowlist.ts` | Priority 500 — hard block if service not on allowlist |
| `rules/approval-threshold.ts` | Priority 600 — soft gate: `pending_approval` if above threshold |
| `rules/index.ts` | `registerBuiltinRules()` — wires all 6 rules onto an engine |

## Key Concepts

### PolicyContext

Every rule receives the same `PolicyContext` — a snapshot of the payment request plus precomputed wallet state. Built once by `buildPolicyContext()`, which is the only function that touches the database.

### Rule Functions

```typescript
type PolicyRuleFn = (ctx: PolicyContext) => PolicyDecision | null | Promise<PolicyDecision | null>;
```

- Return `null` → "no opinion, pass to next rule"
- Return `{ decision, reason }` → terminal decision, pipeline stops

### Priority

Lower numbers run first. Built-in rules use 100–600 in steps of 100, leaving gaps for custom rules (e.g., a velocity rule at priority 350).

### Trace

Every evaluation produces a `trace` array — an audit trail showing which rules ran, what they decided, and how long each took:

```typescript
interface RuleTraceEntry {
  ruleName: string;
  priority: number;
  decision: "allow" | "block" | "pending_approval" | "pass";
  reason?: string;
  durationMs: number;
}
```

## Adding a Custom Rule

```typescript
import { registerRule, type PolicyRuleFn } from "./policy/index.js";

const weekendBlock: PolicyRuleFn = (ctx) => {
  const day = ctx.now.getDay();
  if (day === 0 || day === 6) {
    return { decision: "block", reason: "No payments on weekends" };
  }
  return null;
};

registerRule("weekend-block", 150, weekendBlock);
```

Custom rules can be unregistered with `unregisterRule("weekend-block")`. Built-in rules cannot be unregistered.

## Auto-Approve

When the pipeline returns `pending_approval`, the x402 flow checks the wallet's `AutoApprovePolicy` before creating an `ApprovalRequest`. The policy uses AND logic — all non-null conditions must pass:

| Condition | Description |
|---|---|
| `maxAmount` | Per-tx ceiling for auto-approve (USDC string) |
| `maxDailyCount` | Max auto-approved transactions per day |
| `maxDailyAmount` | Cumulative daily USDC ceiling |
| `servicePattern` | Glob pattern (e.g. `*.example.com`) |

If all conditions pass, the payment proceeds without human intervention. If any fail, it enters the manual approval queue.

### API Endpoints

```
GET    /api/wallets/:walletId/auto-approve   → current policy or null
PUT    /api/wallets/:walletId/auto-approve   → upsert policy
DELETE /api/wallets/:walletId/auto-approve   → remove policy
```

### MCP Tools

- `set_auto_approve_policy` — upsert with conditions
- `get_auto_approve_policy` — view current policy
- `remove_auto_approve_policy` — delete

## Backward Compatibility

`src/rules.ts` still exports `evaluateRules()`, `enforceRules()`, `setRules()`, and `getRules()`. `evaluateRules()` is now a thin wrapper that calls `evaluatePolicy()` and returns the same `RuleDecision` shape. No callers need to change.
