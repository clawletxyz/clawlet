import type { PolicyRuleFn } from "../types.js";

/** Priority 200 — Hard block if service is on the blocklist. */
export const blocklistRule: PolicyRuleFn = (ctx) => {
  if (ctx.rules.blockedServices.length === 0) return null;

  const normalized = ctx.service.toLowerCase();
  const blocked = ctx.rules.blockedServices.some(
    (s) => normalized.includes(s.toLowerCase()),
  );

  if (blocked) {
    return {
      decision: "block",
      reason: `Service "${ctx.service}" is blocked`,
    };
  }
  return null;
};
