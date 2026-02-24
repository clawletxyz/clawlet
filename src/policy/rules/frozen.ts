import type { PolicyRuleFn } from "../types.js";

/** Priority 100 — Hard block if wallet is frozen. */
export const frozenRule: PolicyRuleFn = (ctx) => {
  if (ctx.frozen) {
    return { decision: "block", reason: "Wallet is frozen" };
  }
  return null;
};
