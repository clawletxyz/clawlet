/**
 * End-to-end test: seed wallet → start x402 server → make payment → verify.
 *
 * Usage:  npx tsx demo/test-flow.ts
 */

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

// Dynamically import source modules (they use .js extensions for ESM)
const { initStore, getState } = await import("../src/store.js");
const { createWallet } = await import("../src/wallet.js");
const { setRules } = await import("../src/rules.js");
const { x402Fetch } = await import("../src/x402.js");
const { getTransactions } = await import("../src/ledger.js");

/* ── Mini x402 server (in-process) ──────────────────────────────── */

const MERCHANT = "0x" + "b".repeat(40) as `0x${string}`;

function startMockServer(port: number): Promise<ReturnType<typeof createServer>> {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      const paymentSig = req.headers["payment-signature"] ?? req.headers["x-payment"];

      if (paymentSig) {
        try {
          const decoded = JSON.parse(Buffer.from(paymentSig as string, "base64").toString());
          if (decoded.payload?.signature) {
            const receipt = { transaction: "0x" + randomBytes(32).toString("hex"), settled: true };
            res.writeHead(200, {
              "Content-Type": "application/json",
              "payment-response": Buffer.from(JSON.stringify(receipt)).toString("base64"),
            });
            return res.end(JSON.stringify({ data: "premium content unlocked" }));
          }
        } catch { /* invalid sig */ }
      }

      // Return 402
      const paymentRequired = {
        x402Version: 2,
        accepts: [{
          scheme: "exact",
          network: "eip155:84532",
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          amount: "50000", // 0.05 USDC
          payTo: MERCHANT,
          maxTimeoutSeconds: 600,
          extra: {},
        }],
        resource: { url: `http://localhost:${port}/api/test` },
      };

      res.writeHead(402, {
        "Content-Type": "application/json",
        "payment-required": Buffer.from(JSON.stringify(paymentRequired)).toString("base64"),
      });
      res.end(JSON.stringify({ error: "Payment Required" }));
    });

    srv.listen(port, () => resolve(srv));
  });
}

/* ── Test flow ──────────────────────────────────────────────────── */

async function run() {
  const port = 4099;
  console.log("\n  x402 Integration Test\n");

  // 1. Init store
  console.log("  1. Initializing store...");
  initStore();

  // 2. Create wallet
  console.log("  2. Creating local-key wallet...");
  const wallet = await createWallet("local-key");
  console.log(`     Address: ${wallet.wallet.address}`);

  // 3. Set rules
  console.log("  3. Setting spending rules ($5/tx, $50/day)...");
  setRules({
    maxPerTransaction: "5.00",
    dailyCap: "50.00",
    allowedServices: [],
    blockedServices: [],
  });

  // 4. Start mock server
  console.log("  4. Starting mock x402 server...");
  const server = await startMockServer(port);

  // 5. Make payment
  console.log("  5. Making x402 payment to /api/test...");
  try {
    const result = await x402Fetch(`http://localhost:${port}/api/test`, {
      method: "GET",
      reason: "Integration test payment",
    });

    console.log(`     Status:  ${result.status}`);
    console.log(`     Body:    ${result.body.slice(0, 80)}`);
    console.log(`     TxHash:  ${result.payment?.txHash?.slice(0, 20)}...`);
    console.log(`     Amount:  ${result.payment?.amount} USDC`);

    // 6. Verify transaction recorded
    const txs = getTransactions(1);
    const latest = txs[0];
    console.log(`\n  6. Transaction recorded:`);
    console.log(`     ID:      ${latest.id}`);
    console.log(`     Status:  ${latest.status}`);
    console.log(`     Service: ${latest.service}`);
    console.log(`     Amount:  ${latest.amount} USDC`);

    if (result.status === 200 && latest.status === "settled") {
      console.log("\n  ALL PASSED\n");
    } else {
      console.log("\n  UNEXPECTED STATUS\n");
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("  FAILED:", err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

run();
