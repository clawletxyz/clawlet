#!/usr/bin/env node

import "dotenv/config";

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseUnits } from "viem";
import { initStore, getState, getActiveEntry, setNetwork, getNetworkCaip2 } from "./store.js";
import {
  createWallet, getBalance, freezeWallet, unfreezeWallet,
  listWallets, switchWallet, removeWallet, renameWallet,
  setAgentIdentity, getAgentIdentity,
} from "./wallet.js";
import { setRules, getRules } from "./rules.js";
import { getTransactions } from "./ledger.js";
import type { NetworkId, AgentIdentity } from "./types.js";
import { X402SCAN_TX_URL, X402SCAN_ADDRESS_URL } from "./constants.js";
import { x402Fetch, x402Prepare, x402Complete } from "./x402.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEMO_MODE = process.env.DEMO_MODE === "true";

function getTodaySpent(): string {
  const entry = getActiveEntry();
  if (!entry) return "0.0";
  const today = new Date().toISOString().slice(0, 10);
  let total = 0n;
  for (const tx of entry.transactions) {
    if (tx.status === "settled" && tx.timestamp.startsWith(today)) {
      total += parseUnits(tx.amount, 6);
    }
  }
  const str = total.toString().padStart(7, "0");
  const whole = str.slice(0, str.length - 6) || "0";
  const frac = str.slice(str.length - 6).replace(/0+$/, "") || "0";
  return `${whole}.${frac}`;
}

const app = new Hono();

// CORS
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "PUT", "POST", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type"],
}));

// Demo mode guard
app.use("/api/*", async (c, next) => {
  if (DEMO_MODE && c.req.method !== "GET" && c.req.method !== "OPTIONS") {
    return c.json({ error: "Demo mode — writes are disabled. Clone the repo to run your own instance." }, 403);
  }
  await next();
});

// Global error handler
app.onError((err, c) => {
  return c.json({ error: err.message ?? "Internal error" }, 500);
});

// ── Config ───────────────────────────────────────────────────

app.get("/api/config", (c) => {
  return c.json({ demoMode: DEMO_MODE });
});

// ── Wallets (multi-wallet) ───────────────────────────────────

app.get("/api/wallets", (c) => {
  const state = getState();
  const wallets = listWallets().map((w) => ({
    id: w.id,
    label: w.label,
    address: w.wallet.address,
    frozen: w.wallet.frozen,
    adapter: w.adapterConfig.type,
    createdAt: w.wallet.createdAt,
    agentIdentity: w.agentIdentity ?? null,
    x402scanUrl: X402SCAN_ADDRESS_URL(w.wallet.address),
  }));
  return c.json({ wallets, activeWalletId: state.activeWalletId });
});

app.post("/api/wallets", async (c) => {
  const body = await c.req.json();
  const adapterType: string = body.adapter || "local-key";
  const credentials: Record<string, string> = body.credentials || {};
  const label: string | undefined = body.label;
  const entry = await createWallet(adapterType, credentials, label);
  return c.json({
    id: entry.id,
    label: entry.label,
    wallet: entry.wallet,
    adapter: entry.adapterConfig.type,
  });
});

// Literal routes before parameterized
app.post("/api/wallets/switch", async (c) => {
  const body = await c.req.json();
  if (!body.walletId) return c.json({ error: "walletId required" }, 400);
  const entry = switchWallet(body.walletId);
  return c.json({ activeWalletId: entry.id, label: entry.label });
});

app.post("/api/wallets/rename", async (c) => {
  const body = await c.req.json();
  if (!body.label) return c.json({ error: "label required" }, 400);
  renameWallet(body.label);
  return c.json({ label: body.label });
});

app.delete("/api/wallets/:id", (c) => {
  const walletId = c.req.param("id");
  if (!walletId) return c.json({ error: "Wallet ID required" }, 400);
  removeWallet(walletId);
  return c.json({ deleted: walletId });
});

// ── Legacy single-wallet compat ──────────────────────────────

app.get("/api/wallet", (c) => {
  const entry = getActiveEntry();
  if (!entry) return c.json({ wallet: null, adapter: null });
  return c.json({
    wallet: entry.wallet,
    adapter: entry.adapterConfig.type,
    id: entry.id,
    label: entry.label,
  });
});

app.post("/api/wallet", async (c) => {
  const body = await c.req.json();
  const adapterType: string = body.adapter || "local-key";
  const credentials: Record<string, string> = body.credentials || {};
  const entry = await createWallet(adapterType, credentials);
  return c.json({ wallet: entry.wallet, adapter: entry.adapterConfig.type });
});

// ── Network ──────────────────────────────────────────────────

app.get("/api/network", (c) => {
  const state = getState();
  return c.json({ network: state.network });
});

app.post("/api/network", async (c) => {
  const body = await c.req.json();
  const net = body.network as NetworkId;
  if (net !== "base" && net !== "base-sepolia") {
    return c.json({ error: "network must be 'base' or 'base-sepolia'" }, 400);
  }
  setNetwork(net);
  return c.json({ network: net });
});

// ── Balance ──────────────────────────────────────────────────

app.get("/api/balance", async (c) => {
  const networkParam = c.req.query("network");
  let networkCaip2: string;
  if (networkParam === "base-sepolia") {
    networkCaip2 = "eip155:84532";
  } else if (networkParam === "base") {
    networkCaip2 = "eip155:8453";
  } else {
    networkCaip2 = getNetworkCaip2();
  }
  const balance = await getBalance(networkCaip2);
  return c.json({ balance, network: networkCaip2 });
});

// ── Rules ────────────────────────────────────────────────────

app.get("/api/rules", (c) => {
  return c.json(getRules());
});

app.put("/api/rules", async (c) => {
  const body = await c.req.json();
  const rules = setRules(body);
  return c.json(rules);
});

// ── Transactions ─────────────────────────────────────────────

app.get("/api/transactions", (c) => {
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const txs = getTransactions(Math.min(limit, 200));
  return c.json({ count: txs.length, transactions: txs });
});

app.get("/api/today-spent", (c) => {
  return c.json({ spent: getTodaySpent() });
});

// ── Agent Identity ───────────────────────────────────────────

app.get("/api/agent-identity", (c) => {
  const identity = getAgentIdentity();
  return c.json({ identity });
});

app.post("/api/agent-identity", async (c) => {
  const body = await c.req.json() as Partial<AgentIdentity>;
  if (!body.name) return c.json({ error: "name is required" }, 400);
  setAgentIdentity(body as AgentIdentity);
  return c.json({ identity: getAgentIdentity() });
});

// ── x402scan Links ───────────────────────────────────────────

app.get("/api/x402scan/tx", (c) => {
  const txHash = c.req.query("hash");
  if (!txHash) return c.json({ error: "hash query param required" }, 400);
  return c.json({ url: X402SCAN_TX_URL(txHash) });
});

app.get("/api/x402scan/address", (c) => {
  const addr = c.req.query("address");
  if (!addr) {
    const entry = getActiveEntry();
    if (!entry) return c.json({ error: "No active wallet" }, 400);
    return c.json({ url: X402SCAN_ADDRESS_URL(entry.wallet.address) });
  }
  return c.json({ url: X402SCAN_ADDRESS_URL(addr) });
});

// ── Pay (x402 test payment) ─────────────────────────────────

app.post("/api/pay", async (c) => {
  const body = await c.req.json();
  const payUrl: string = body.url;
  if (!payUrl) return c.json({ error: "url is required" }, 400);
  try {
    const result = await x402Fetch(payUrl, {
      method: body.method || "GET",
      headers: body.headers,
      body: body.body,
      reason: body.reason || "Dashboard test payment",
    });
    return c.json({
      status: result.status,
      body: result.body.slice(0, 4000),
      payment: result.payment ?? null,
    });
  } catch (err: any) {
    return c.json({
      status: 0,
      error: err.message ?? "Payment failed",
      body: null,
      payment: null,
    });
  }
});

// ── Pay Prepare (browser wallet two-phase) ───────────────────

app.post("/api/pay/prepare", async (c) => {
  const body = await c.req.json();
  const payUrl: string = body.url;
  if (!payUrl) return c.json({ error: "url is required" }, 400);
  try {
    const result = await x402Prepare(payUrl, {
      method: body.method || "GET",
      headers: body.headers,
      body: body.body,
      reason: body.reason || "Dashboard browser wallet payment",
    });
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message ?? "Payment preparation failed" }, 400);
  }
});

// ── Pay Complete (browser wallet two-phase) ──────────────────

app.post("/api/pay/complete", async (c) => {
  const body = await c.req.json();
  if (!body.sessionId) return c.json({ error: "sessionId is required" }, 400);
  if (!body.signature) return c.json({ error: "signature is required" }, 400);
  try {
    const result = await x402Complete(body.sessionId, body.signature);
    return c.json({
      status: result.status,
      body: result.body.slice(0, 4000),
      payment: result.payment ?? null,
    });
  } catch (err: any) {
    return c.json({
      status: 0,
      error: err.message ?? "Payment completion failed",
      body: null,
      payment: null,
    });
  }
});

// ── Freeze / Unfreeze ────────────────────────────────────────

app.post("/api/freeze", (c) => {
  freezeWallet();
  return c.json({ frozen: true });
});

app.post("/api/unfreeze", (c) => {
  unfreezeWallet();
  return c.json({ frozen: false });
});

// ── Dashboard (static files + SPA fallback) ──────────────────

app.use("/*", serveStatic({ root: "./dashboard/dist" }));

app.use("/*", serveStatic({
  root: "./dashboard/dist",
  rewriteRequestPath: () => "/index.html",
}));

// Legacy fallback if dashboard/dist doesn't exist
app.notFound((c) => {
  const legacyPath = join(__dirname, "dashboard.html");
  if (existsSync(legacyPath)) {
    return c.html(readFileSync(legacyPath, "utf-8"));
  }
  return c.json({ error: "Not found" }, 404);
});

// ── Server ───────────────────────────────────────────────────

export async function main() {
  initStore();
  const port = parseInt(process.env.PORT ?? "3000", 10);
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`\n  Clawlet Dashboard`);
    console.log(`  http://localhost:${info.port}\n`);
  });
}

// Auto-start when run directly (not imported)
const isDirectRun = process.argv[1] &&
  (process.argv[1].endsWith("/api.js") || process.argv[1].endsWith("/api.ts"));
if (isDirectRun) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
