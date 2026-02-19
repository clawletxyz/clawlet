/**
 * Seed the .clawlet/state.json with a demo wallet and sample transactions.
 * Makes the dashboard look populated and interesting for demos.
 *
 * Usage:  npx tsx demo/seed.ts
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

function walletId(): string {
  return randomBytes(8).toString("hex");
}

function txId(): string {
  return randomBytes(16).toString("hex");
}

function fakeTxHash(): string {
  return "0x" + randomBytes(32).toString("hex");
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

export function seedState(dataDir?: string): void {
  const dir = dataDir ?? join(process.cwd(), ".clawlet");
  const statePath = join(dir, "state.json");

  const pk1 = generatePrivateKey();
  const account1 = privateKeyToAccount(pk1);
  const pk2 = generatePrivateKey();
  const account2 = privateKeyToAccount(pk2);

  const MERCHANT = "0x" + "a".repeat(40);
  const id1 = walletId();
  const id2 = walletId();

  const state = {
    wallets: [
      {
        id: id1,
        label: "Agent Wallet",
        wallet: {
          address: account1.address,
          createdAt: hoursAgo(48),
          frozen: false,
        },
        adapterConfig: {
          type: "local-key",
          privateKey: pk1,
        },
        agentIdentity: {
          name: "ResearchBot",
          description: "Autonomous research agent for market analysis and data retrieval",
        },
        rules: {
          maxPerTransaction: "5.00",
          dailyCap: "50.00",
          allowedServices: [],
          blockedServices: [],
        },
        transactions: [
          {
            id: txId(),
            timestamp: hoursAgo(0.1),
            to: MERCHANT,
            service: "localhost",
            amount: "0.10",
            asset: "USDC",
            network: "eip155:84532",
            txHash: fakeTxHash(),
            status: "settled",
            reason: "Crypto market snapshot",
          },
          {
            id: txId(),
            timestamp: hoursAgo(0.3),
            to: MERCHANT,
            service: "localhost",
            amount: "0.01",
            asset: "USDC",
            network: "eip155:84532",
            txHash: fakeTxHash(),
            status: "settled",
            reason: "Premium AI joke",
          },
          {
            id: txId(),
            timestamp: hoursAgo(0.8),
            to: MERCHANT,
            service: "api.weather.io",
            amount: "0.05",
            asset: "USDC",
            network: "eip155:84532",
            txHash: fakeTxHash(),
            status: "settled",
            reason: "Weather forecast",
          },
          {
            id: txId(),
            timestamp: hoursAgo(1.5),
            to: MERCHANT,
            service: "localhost",
            amount: "0.25",
            asset: "USDC",
            network: "eip155:84532",
            txHash: fakeTxHash(),
            status: "settled",
            reason: "AI code review",
          },
          {
            id: txId(),
            timestamp: hoursAgo(2),
            to: MERCHANT,
            service: "api.social.dev",
            amount: "0.02",
            asset: "USDC",
            network: "eip155:84532",
            txHash: fakeTxHash(),
            status: "settled",
            reason: "Social sentiment analysis",
          },
          {
            id: txId(),
            timestamp: hoursAgo(3),
            to: MERCHANT,
            service: "localhost",
            amount: "0.10",
            asset: "USDC",
            network: "eip155:84532",
            txHash: null,
            status: "pending",
            reason: "Crypto market snapshot",
          },
          {
            id: txId(),
            timestamp: hoursAgo(5),
            to: MERCHANT,
            service: "evil.example.com",
            amount: "1.00",
            asset: "USDC",
            network: "eip155:84532",
            txHash: null,
            status: "failed",
            reason: "Service blocked by rules",
          },
          {
            id: txId(),
            timestamp: hoursAgo(8),
            to: MERCHANT,
            service: "api.weather.io",
            amount: "0.05",
            asset: "USDC",
            network: "eip155:8453",
            txHash: fakeTxHash(),
            status: "settled",
            reason: "Weather forecast",
          },
          {
            id: txId(),
            timestamp: hoursAgo(12),
            to: MERCHANT,
            service: "localhost",
            amount: "0.01",
            asset: "USDC",
            network: "eip155:84532",
            txHash: fakeTxHash(),
            status: "settled",
            reason: "Premium AI joke",
          },
          {
            id: txId(),
            timestamp: hoursAgo(24),
            to: MERCHANT,
            service: "localhost",
            amount: "0.10",
            asset: "USDC",
            network: "eip155:8453",
            txHash: fakeTxHash(),
            status: "settled",
            reason: "Crypto market snapshot",
          },
        ],
      },
      {
        id: id2,
        label: "Treasury",
        wallet: {
          address: account2.address,
          createdAt: hoursAgo(24),
          frozen: false,
        },
        adapterConfig: {
          type: "local-key",
          privateKey: pk2,
        },
        rules: {
          maxPerTransaction: "100.00",
          dailyCap: null,
          allowedServices: [],
          blockedServices: [],
        },
        transactions: [],
      },
    ],
    activeWalletId: id1,
    network: "base-sepolia",
  };

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");

  console.log(`
  Demo state seeded! (v2 multi-wallet format)

  Wallet 1:     ${account1.address}
    Label:      Agent Wallet
    Adapter:    local-key
    Rules:      $5.00/tx, $50.00/day
    Txns:       ${state.wallets[0].transactions.length} records

  Wallet 2:     ${account2.address}
    Label:      Treasury
    Adapter:    local-key
    Rules:      $100.00/tx, no daily cap
    Txns:       0 records

  Active:       Wallet 1 (Agent Wallet)
  Network:      base-sepolia

  State file:   ${join(dir, "state.json")}

  Now run:  npm run dev
`);
}

// CLI usage: run directly
const isDirectRun = process.argv[1] &&
  (process.argv[1].endsWith("/seed.js") || process.argv[1].endsWith("/seed.ts"));
if (isDirectRun) {
  seedState();
}
