#!/usr/bin/env node

import "dotenv/config";

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { parseUnits } from "viem";
import { initStore, getState, setNetwork, getNetworkCaip2 } from "./store.js";
import {
  createWallet, getBalance, freezeWallet, unfreezeWallet,
  listWallets, removeWallet, renameWallet,
  setAgentIdentity, getAgentIdentity, getAdapter,
} from "./wallet.js";
import { setRules, getRules } from "./rules.js";
import { getTransactions } from "./ledger.js";
import { db } from "./db.js";
import { toTransactionRecord, toWalletEntry, toApprovalRequest } from "./mappers.js";
import type { NetworkId, AgentIdentity } from "./types.js";
import { X402SCAN_TX_URL, X402SCAN_ADDRESS_URL } from "./constants.js";
import { x402Fetch, x402Prepare, x402Complete, executeApprovedPayment, rejectApproval } from "./x402.js";
import { startConfirmationWorker } from "./confirmation-worker.js";
import { startApprovalWorker } from "./approval-worker.js";

const DEMO_MODE = process.env.DEMO_MODE === "true";

async function getTodaySpentForWallet(walletId: string): Promise<string> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const rows = await db().transaction.findMany({
    where: {
      walletId,
      status: { in: ["settled", "settling"] },
      timestamp: { gte: todayStart },
    },
    select: { amount: true },
  });

  let total = 0n;
  for (const row of rows) {
    total += parseUnits(row.amount, 6);
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
  allowHeaders: ["Content-Type", "Idempotency-Key", "Authorization"],
}));

// Auth middleware (bearer token from CLAWLET_API_KEY env var)
app.use("/api/*", async (c, next) => {
  const apiKey = process.env.CLAWLET_API_KEY;
  if (!apiKey) return next();                       // Auth disabled
  if (c.req.path === "/api/config") return next();  // Config always public
  const auth = c.req.header("Authorization");
  if (auth === `Bearer ${apiKey}`) return next();
  return c.json({ error: "Unauthorized" }, 401);
});

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
  return c.json({ demoMode: DEMO_MODE, authRequired: !!process.env.CLAWLET_API_KEY });
});

// ── Wallets (multi-wallet) ───────────────────────────────────

app.get("/api/wallets", async (c) => {
  const entries = await listWallets();
  const wallets = await Promise.all(
    entries.map(async (w) => {
      const adapter = await getAdapter(w.id);
      return {
        id: w.id,
        label: w.label,
        address: w.wallet.address,
        frozen: w.wallet.frozen,
        adapter: w.adapterConfig.type,
        canSignServerSide: adapter.canSignServerSide,
        createdAt: w.wallet.createdAt,
        agentIdentity: w.agentIdentity ?? null,
        tags: w.tags ?? {},
        x402scanUrl: X402SCAN_ADDRESS_URL(w.wallet.address),
      };
    }),
  );
  return c.json({ wallets });
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

// ── Wallet-scoped routes (/api/wallets/:walletId/...) ────────

app.get("/api/wallets/:walletId/transactions", async (c) => {
  const wId = c.req.param("walletId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const txs = await getTransactions(Math.min(limit, 200), wId);
  return c.json({ count: txs.length, transactions: txs });
});

app.get("/api/wallets/:walletId/rules", async (c) => {
  const wId = c.req.param("walletId");
  return c.json(await getRules(wId));
});

app.put("/api/wallets/:walletId/rules", async (c) => {
  const wId = c.req.param("walletId");
  const body = await c.req.json();
  const rules = await setRules(body, wId);
  return c.json(rules);
});

app.get("/api/wallets/:walletId/balance", async (c) => {
  const wId = c.req.param("walletId");
  const networkParam = c.req.query("network");
  let networkCaip2: string;
  if (networkParam === "base-sepolia") {
    networkCaip2 = "eip155:84532";
  } else if (networkParam === "base") {
    networkCaip2 = "eip155:8453";
  } else {
    networkCaip2 = getNetworkCaip2();
  }
  const balance = await getBalance(networkCaip2, wId);
  return c.json({ balance, network: networkCaip2 });
});

app.post("/api/wallets/:walletId/freeze", async (c) => {
  const wId = c.req.param("walletId");
  await freezeWallet(wId);
  return c.json({ frozen: true });
});

app.post("/api/wallets/:walletId/unfreeze", async (c) => {
  const wId = c.req.param("walletId");
  await unfreezeWallet(wId);
  return c.json({ frozen: false });
});

app.post("/api/wallets/:walletId/rename", async (c) => {
  const wId = c.req.param("walletId");
  const body = await c.req.json();
  if (!body.label) return c.json({ error: "label required" }, 400);
  await renameWallet(body.label, wId);
  return c.json({ label: body.label });
});

app.get("/api/wallets/:walletId/agent-identity", async (c) => {
  const wId = c.req.param("walletId");
  const identity = await getAgentIdentity(wId);
  return c.json({ identity });
});

app.post("/api/wallets/:walletId/agent-identity", async (c) => {
  const wId = c.req.param("walletId");
  const body = await c.req.json() as Partial<AgentIdentity>;
  if (!body.name) return c.json({ error: "name is required" }, 400);
  await setAgentIdentity(body as AgentIdentity, wId);
  return c.json({ identity: await getAgentIdentity(wId) });
});

app.get("/api/wallets/:walletId/today-spent", async (c) => {
  const wId = c.req.param("walletId");
  return c.json({ spent: await getTodaySpentForWallet(wId) });
});

app.get("/api/wallets/:walletId/tags", async (c) => {
  const wId = c.req.param("walletId");
  const row = await db().wallet.findUnique({ where: { id: wId } });
  if (!row) return c.json({ error: "Wallet not found" }, 404);
  return c.json({ tags: JSON.parse((row as any).tags ?? "{}") });
});

app.put("/api/wallets/:walletId/tags", async (c) => {
  const wId = c.req.param("walletId");
  const body = await c.req.json() as Record<string, string>;
  const row = await db().wallet.findUnique({ where: { id: wId } });
  if (!row) return c.json({ error: "Wallet not found" }, 404);
  const existing = JSON.parse((row as any).tags ?? "{}") as Record<string, string>;
  const merged = { ...existing, ...body };
  await db().wallet.update({
    where: { id: wId },
    data: { tags: JSON.stringify(merged) } as any,
  });
  return c.json({ tags: merged });
});

app.post("/api/wallets/:walletId/pay", async (c) => {
  const wId = c.req.param("walletId");
  const adapter = await getAdapter(wId);
  if (!adapter.canSignServerSide) {
    return c.json({
      error: "This wallet cannot sign server-side. Use /pay/prepare + /pay/complete.",
    }, 400);
  }
  const body = await c.req.json();
  const payUrl: string = body.url;
  if (!payUrl) return c.json({ error: "url is required" }, 400);
  const idempotencyKey =
    c.req.header("Idempotency-Key") ?? body.idempotencyKey ?? undefined;
  try {
    const result = await x402Fetch(
      payUrl,
      {
        method: body.method || "GET",
        headers: body.headers,
        body: body.body,
        reason: body.reason || "API wallet-scoped payment",
      },
      idempotencyKey,
      wId,
    );
    if (result.pendingApproval) {
      return c.json({
        status: 202,
        pendingApproval: result.pendingApproval,
        payment: null,
      });
    }
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

app.post("/api/wallets/:walletId/pay/prepare", async (c) => {
  const wId = c.req.param("walletId");
  const adapter = await getAdapter(wId);
  const body = await c.req.json();
  const payUrl: string = body.url;
  if (!payUrl) return c.json({ error: "url is required" }, 400);
  try {
    const result = await x402Prepare(payUrl, {
      method: body.method || "GET",
      headers: body.headers,
      body: body.body,
      reason: body.reason || "Dashboard browser wallet payment",
    }, wId);
    const response: Record<string, unknown> = { ...result };
    if (adapter.canSignServerSide) {
      response._hint = "This wallet can sign server-side. POST /pay is simpler.";
    }
    return c.json(response);
  } catch (err: any) {
    return c.json({ error: err.message ?? "Payment preparation failed" }, 400);
  }
});

app.post("/api/wallets/:walletId/pay/complete", async (c) => {
  const wId = c.req.param("walletId");
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

app.delete("/api/wallets/:id", async (c) => {
  const walletId = c.req.param("id");
  if (!walletId) return c.json({ error: "Wallet ID required" }, 400);
  await removeWallet(walletId);
  return c.json({ deleted: walletId });
});

// ── Approval Queue ───────────────────────────────────────────

app.get("/api/approvals", async (c) => {
  const status = c.req.query("status");
  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const rows = await db().approvalRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return c.json({ count: rows.length, approvals: rows.map(toApprovalRequest) });
});

app.get("/api/approvals/count", async (c) => {
  const count = await db().approvalRequest.count({
    where: { status: "pending" },
  });
  return c.json({ count });
});

app.get("/api/wallets/:walletId/approvals", async (c) => {
  const wId = c.req.param("walletId");
  const status = c.req.query("status");
  const where: Record<string, unknown> = { walletId: wId };
  if (status) where.status = status;

  const rows = await db().approvalRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return c.json({ count: rows.length, approvals: rows.map(toApprovalRequest) });
});

app.post("/api/approvals/:id/approve", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  try {
    const result = await executeApprovedPayment(id, body.decidedBy);
    return c.json({
      status: result.status,
      body: result.body.slice(0, 4000),
      payment: result.payment,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.post("/api/approvals/:id/reject", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  try {
    await rejectApproval(id, body.decidedBy);
    return c.json({ status: "rejected" });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// ── Auto-Approve Policies ─────────────────────────────────────

app.get("/api/wallets/:walletId/auto-approve", async (c) => {
  const wId = c.req.param("walletId");
  const row = await db().autoApprovePolicy.findUnique({
    where: { walletId: wId },
  });
  return c.json({ policy: row ?? null });
});

app.put("/api/wallets/:walletId/auto-approve", async (c) => {
  const wId = c.req.param("walletId");
  // Verify wallet exists
  const wallet = await db().wallet.findUnique({ where: { id: wId } });
  if (!wallet) return c.json({ error: "Wallet not found" }, 404);

  const body = await c.req.json();
  const policy = await db().autoApprovePolicy.upsert({
    where: { walletId: wId },
    create: {
      walletId: wId,
      enabled: body.enabled ?? true,
      maxAmount: body.maxAmount ?? null,
      maxDailyCount: body.maxDailyCount ?? null,
      maxDailyAmount: body.maxDailyAmount ?? null,
      servicePattern: body.servicePattern ?? null,
    },
    update: {
      enabled: body.enabled ?? true,
      maxAmount: body.maxAmount ?? null,
      maxDailyCount: body.maxDailyCount ?? null,
      maxDailyAmount: body.maxDailyAmount ?? null,
      servicePattern: body.servicePattern ?? null,
    },
  });
  return c.json({ policy });
});

app.delete("/api/wallets/:walletId/auto-approve", async (c) => {
  const wId = c.req.param("walletId");
  try {
    await db().autoApprovePolicy.delete({ where: { walletId: wId } });
    return c.json({ deleted: true });
  } catch {
    return c.json({ deleted: false, error: "No auto-approve policy found" }, 404);
  }
});

// ── Aggregate endpoints ──────────────────────────────────────

app.get("/api/overview", async (c) => {
  const allWallets = await listWallets();
  const wallets = await Promise.all(
    allWallets.map(async (w) => ({
      id: w.id,
      label: w.label,
      address: w.wallet.address,
      frozen: w.wallet.frozen,
      adapter: w.adapterConfig.type,
      tags: w.tags ?? {},
      rules: w.rules,
      todaySpent: await getTodaySpentForWallet(w.id),
      createdAt: w.wallet.createdAt,
    })),
  );
  return c.json({ wallets });
});

app.get("/api/transactions/all", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "100", 10);
  const rows = await db().transaction.findMany({
    orderBy: { timestamp: "desc" },
    take: Math.min(limit, 500),
  });
  const transactions = rows.map(toTransactionRecord);
  return c.json({ count: transactions.length, transactions });
});

// ── Network ──────────────────────────────────────────────────

app.get("/api/network", async (c) => {
  const state = await getState();
  return c.json({ network: state.network });
});

app.post("/api/network", async (c) => {
  const body = await c.req.json();
  const net = body.network as NetworkId;
  if (net !== "base" && net !== "base-sepolia") {
    return c.json({ error: "network must be 'base' or 'base-sepolia'" }, 400);
  }
  await setNetwork(net);
  return c.json({ network: net });
});

// ── x402scan Links ───────────────────────────────────────────

app.get("/api/x402scan/tx", (c) => {
  const txHash = c.req.query("hash");
  if (!txHash) return c.json({ error: "hash query param required" }, 400);
  return c.json({ url: X402SCAN_TX_URL(txHash) });
});

app.get("/api/x402scan/address", async (c) => {
  const addr = c.req.query("address");
  if (!addr) {
    return c.json({ error: "address query param required" }, 400);
  }
  return c.json({ url: X402SCAN_ADDRESS_URL(addr) });
});

// ── Dashboard (static files + SPA fallback) ──────────────────

app.use("/*", serveStatic({ root: "./dashboard/dist" }));

app.use("/*", serveStatic({
  root: "./dashboard/dist",
  rewriteRequestPath: () => "/index.html",
}));

app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// ── Server ───────────────────────────────────────────────────

export async function main(options?: { silent?: boolean }) {
  await initStore();
  startConfirmationWorker();
  startApprovalWorker();
  const port = parseInt(process.env.PORT ?? "3000", 10);
  serve({ fetch: app.fetch, port }, (info) => {
    if (!options?.silent) {
      console.log(`\n  Clawlet Dashboard`);
      console.log(`  http://localhost:${info.port}\n`);
    }
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
