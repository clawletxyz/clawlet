import type { PolicyRuleFn } from "../types.js";

/** Priority 500 — Hard block if service is not on the allowlist (when allowlist is configured). */
export const allowlistRule: PolicyRuleFn = (ctx) => {
  if (ctx.rules.allowedServices.length === 0) return null;

  const normalized = ctx.service.toLowerCase();
  const allowed = ctx.rules.allowedServices.some(
    (s) => normalized.includes(s.toLowerCase()),
  );

  if (!allowed) {
    return {
      decision: "block",
      reason: `Service "${ctx.service}" is not in the allowed services list`,
    };
  }
  return null;
};
