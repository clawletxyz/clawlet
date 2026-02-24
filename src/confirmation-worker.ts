import { db } from "./db.js";
import { updateTransaction } from "./ledger.js";
import { getTransactionReceipt, getBlockNumber } from "./rpc.js";

// ── Config ──────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000;
const MAX_SETTLING_AGE_HOURS = 24;

const REQUIRED_CONFIRMATIONS: Record<string, number> = {
  "eip155:8453": 12,
  "eip155:84532": 3,
};

function getRequiredConfirmations(network: string): number {
  return REQUIRED_CONFIRMATIONS[network] ?? 12;
}

// ── Sweep logic ─────────────────────────────────────────────────────

async function sweep(): Promise<void> {
  const settlingTxs = await db().transaction.findMany({
    where: { status: "settling" },
  });

  if (settlingTxs.length === 0) return;

  // Group by network, fetch current block once per network
  const networks = [...new Set(settlingTxs.map((tx) => tx.network))];
  const currentBlocks = new Map<string, number>();

  await Promise.all(
    networks.map(async (network) => {
      try {
        const blockNum = await getBlockNumber(network);
        currentBlocks.set(network, blockNum);
      } catch {
        // Skip this network on RPC failure — will retry next sweep
      }
    }),
  );

  const now = Date.now();
  const maxAge = MAX_SETTLING_AGE_HOURS * 60 * 60 * 1000;

  for (const tx of settlingTxs) {
    try {
      const age = now - tx.timestamp.getTime();
      const currentBlock = currentBlocks.get(tx.network);
      const flags: Record<string, boolean> = JSON.parse(tx.settlementFlags || "{}");

      // No txHash — can only wait or timeout
      if (!tx.txHash) {
        if (age > maxAge) {
          await updateTransaction(tx.id, {
            status: "failed",
            reason: "No txHash received — timed out after 24h",
          });
        }
        continue;
      }

      // Can't check without current block number
      if (currentBlock === undefined) continue;

      const receipt = await getTransactionReceipt(tx.network, tx.txHash);

      if (!receipt) {
        // Receipt null — tx may be pending or reorged
        if ((tx as any).confirmations > 0) {
          // Had confirmations before → likely reorg
          flags.reorgDetected = true;
          await updateTransaction(tx.id, {
            confirmations: 0,
            confirmedAt: null,
            settlementFlags: flags,
          });
        } else if (age > maxAge) {
          await updateTransaction(tx.id, {
            status: "failed",
            reason: "Transaction not found on-chain after 24h",
          });
        }
        continue;
      }

      // Receipt found but reverted
      if (receipt.status === "0x0") {
        await updateTransaction(tx.id, {
          status: "failed",
          reason: "Transaction reverted on-chain",
          lastCheckedBlock: currentBlock,
        });
        continue;
      }

      // Receipt found and successful
      const confirmations = currentBlock - receipt.blockNumber;
      const required = getRequiredConfirmations(tx.network);

      if (confirmations >= required) {
        // Fully confirmed
        await updateTransaction(tx.id, {
          status: "settled",
          confirmations,
          confirmedAt: (tx as any).confirmedAt ?? new Date(),
          lastCheckedBlock: currentBlock,
        });
      } else {
        // Still accumulating confirmations
        await updateTransaction(tx.id, {
          confirmations,
          confirmedAt: (tx as any).confirmedAt ?? new Date(),
          lastCheckedBlock: currentBlock,
        });
      }
    } catch {
      // Per-tx errors don't stop the sweep
    }
  }
}

// ── Worker lifecycle ────────────────────────────────────────────────

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startConfirmationWorker(): void {
  if (intervalHandle) return; // Already running

  // Immediate sweep on boot to pick up any leftover settling txs
  sweep().catch(() => {});

  intervalHandle = setInterval(() => {
    sweep().catch(() => {});
  }, POLL_INTERVAL_MS);
}

export function stopConfirmationWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
