import { db } from "./db.js";

const POLL_INTERVAL_MS = 30_000;

/** Expire stale approval requests past their TTL. */
async function sweep(): Promise<void> {
  const now = new Date();

  const expired = await db().approvalRequest.updateMany({
    where: {
      status: "pending",
      expiresAt: { lt: now },
    },
    data: { status: "expired" },
  });

  if (expired.count > 0) {
    // Silently log — no console noise unless debugging
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startApprovalWorker(): void {
  if (intervalHandle) return;

  // Immediate sweep on boot
  sweep().catch(() => {});

  intervalHandle = setInterval(() => {
    sweep().catch(() => {});
  }, POLL_INTERVAL_MS);
}

export function stopApprovalWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
