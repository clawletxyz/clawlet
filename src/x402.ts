import { randomBytes } from "node:crypto";
import { formatUnits, type Hex, type Address } from "viem";
import {
  USDC,
  USDC_DOMAIN,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  CHAIN_IDS,
} from "./constants.js";
import { getWallet, getAdapter, getAgentIdentity } from "./wallet.js";
import { getNetworkCaip2, resolveWalletEntry } from "./store.js";
import { evaluatePolicy, checkAutoApprove, type PolicyEvaluation } from "./policy/index.js";
import { enforceRules } from "./rules.js";
import { addTransaction, updateTransaction } from "./ledger.js";
import { db } from "./db.js";
import { toPaymentSession } from "./mappers.js";
import type {
  PaymentRequired,
  PaymentRequirements,
  PaymentPayload,
  ExactEvmPayload,
} from "./types.js";
import type { WalletAdapter } from "./adapters/types.js";

// ── Session cleanup (durable via DB) ─────────────────────────────────

/** Remove expired sessions and mark their transactions as failed. */
async function cleanupSessions(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const expired = await db().paymentSession.findMany({
    where: { expiresAt: { lt: now } },
  });

  for (const session of expired) {
    await updateTransaction(session.txRecordId, {
      status: "failed",
      reason: "Payment session expired",
    });
  }

  if (expired.length > 0) {
    await db().paymentSession.deleteMany({
      where: { expiresAt: { lt: now } },
    });
  }
}

// Sweep expired sessions every 60 seconds
setInterval(() => { cleanupSessions().catch(() => {}); }, 60_000);

// ── Shared negotiate logic ───────────────────────────────────────────

export interface NegotiateResult {
  accepted: PaymentRequirements;
  paymentRequired: PaymentRequired;
  service: string;
}

export type NegotiateOutcome =
  | { type: "payment"; result: NegotiateResult; evaluation: PolicyEvaluation }
  | { type: "passthrough"; response: { status: number; headers: Record<string, string>; body: string } };

/**
 * Perform the x402 negotiation: send initial request, parse 402 response,
 * and evaluate spending rules. Returns the negotiation result with the
 * rule decision (allow / block / pending_approval).
 */
export async function negotiate(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
  walletId: string,
): Promise<NegotiateOutcome> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { ...options.headers };

  const initialResponse = await fetch(url, {
    method,
    headers,
    body: options.body,
  });

  if (initialResponse.status !== 402) {
    const responseHeaders: Record<string, string> = {};
    initialResponse.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });
    return {
      type: "passthrough",
      response: {
        status: initialResponse.status,
        headers: responseHeaders,
        body: await initialResponse.text(),
      },
    };
  }

  const paymentRequiredHeader =
    initialResponse.headers.get("payment-required") ??
    initialResponse.headers.get("PAYMENT-REQUIRED");

  let paymentRequired: PaymentRequired;

  if (paymentRequiredHeader) {
    const decoded = Buffer.from(paymentRequiredHeader, "base64").toString("utf-8");
    paymentRequired = JSON.parse(decoded) as PaymentRequired;
  } else {
    const body = await initialResponse.text();
    paymentRequired = JSON.parse(body) as PaymentRequired;
  }

  const accepted = findAcceptedOption(paymentRequired.accepts);
  if (!accepted) {
    throw new Error(
      `No compatible payment option found. Server accepts: ${JSON.stringify(paymentRequired.accepts.map((a) => ({ scheme: a.scheme, network: a.network, asset: a.asset })))}`,
    );
  }

  const selectedNetwork = getNetworkCaip2();
  if (accepted.network !== selectedNetwork) {
    const isTestnet = selectedNetwork.includes("84532");
    const serverNetwork = accepted.network.includes("84532")
      ? "testnet (Base Sepolia)"
      : "mainnet (Base)";
    throw new Error(
      `Network mismatch: you are on ${isTestnet ? "testnet" : "mainnet"}, but the server is requesting payment on ${serverNetwork}. Switch networks to proceed.`,
    );
  }

  const service = new URL(url).hostname;
  const evaluation = await evaluatePolicy(accepted.amount, service, 6, walletId, {
    requestMethod: options.method,
    requestUrl: url,
  });

  return {
    type: "payment",
    result: { accepted, paymentRequired, service },
    evaluation,
  };
}

// ── Retry with signed payment ────────────────────────────────────────

async function retryWithPayment(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string },
  paymentRequired: PaymentRequired,
  accepted: PaymentRequirements,
  payload: ExactEvmPayload,
  txRecordId: string,
  walletId?: string,
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: string;
  payment: { txHash: string | null; amount: string; to: Address };
}> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { ...options.headers };

  const paymentPayload: PaymentPayload = {
    x402Version: paymentRequired.x402Version ?? 2,
    resource: paymentRequired.resource,
    accepted,
    payload,
  };

  const encoded = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

  const agentIdentity = walletId ? await getAgentIdentity(walletId) : null;

  const retryHeaders: Record<string, string> = {
    ...headers,
    "PAYMENT-SIGNATURE": encoded,
    "X-PAYMENT": encoded,
  };

  if (agentIdentity?.agentId && agentIdentity?.agentRegistry) {
    retryHeaders["X-AGENT-ID"] = agentIdentity.agentId;
    retryHeaders["X-AGENT-REGISTRY"] = agentIdentity.agentRegistry;
    if (agentIdentity.name) {
      retryHeaders["X-AGENT-NAME"] = agentIdentity.name;
    }
  }

  const retryResponse = await fetch(url, {
    method,
    headers: retryHeaders,
    body: options.body,
  });

  const retryBody = await retryResponse.text();
  const responseHeaders: Record<string, string> = {};
  retryResponse.headers.forEach((v, k) => {
    responseHeaders[k] = v;
  });

  let txHash: string | null = null;
  const paymentResponseHeader =
    retryResponse.headers.get("payment-response") ??
    retryResponse.headers.get("PAYMENT-RESPONSE") ??
    retryResponse.headers.get("x-payment-response") ??
    retryResponse.headers.get("X-PAYMENT-RESPONSE");

  if (paymentResponseHeader) {
    try {
      const receipt = JSON.parse(
        Buffer.from(paymentResponseHeader, "base64").toString("utf-8"),
      );
      txHash = receipt.transaction ?? receipt.txHash ?? null;
    } catch {
      // ignore malformed receipt
    }
  }

  if (retryResponse.ok) {
    const flags: Record<string, boolean> = {};
    if (!txHash) flags.missingTxHash = true;
    await updateTransaction(txRecordId, {
      status: "settling",
      txHash: txHash ?? undefined,
      ...(Object.keys(flags).length > 0 ? { settlementFlags: flags } : {}),
    });
  } else {
    await updateTransaction(txRecordId, { status: "failed" });
  }

  return {
    status: retryResponse.status,
    headers: responseHeaders,
    body: retryBody,
    payment: {
      txHash,
      amount: formatUnits(BigInt(accepted.amount), 6),
      to: accepted.payTo,
    },
  };
}

// ── Main x402Fetch (single-step, for server-side adapters) ───────────

export async function x402Fetch(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    reason?: string;
  } = {},
  idempotencyKey?: string,
  walletId?: string,
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: string;
  payment?: { txHash: string | null; amount: string; to: Address };
  pendingApproval?: { approvalId: string; reason: string; expiresAt: string };
}> {
  if (!walletId) throw new Error("walletId is required for x402Fetch");
  const wallet = await getWallet(walletId);
  if (wallet.frozen) {
    throw new Error("Wallet is frozen. Unfreeze it before making payments.");
  }

  // Idempotency check: if key provided, look for existing transaction
  if (idempotencyKey) {
    const existing = await db().transaction.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (existing.status === "settled" || existing.status === "settling") {
        return {
          status: 200,
          headers: {},
          body: `Payment already completed (idempotent replay)`,
          payment: {
            txHash: existing.txHash,
            amount: existing.amount,
            to: existing.to as Address,
          },
        };
      }
      if (existing.status === "pending") {
        throw new Error("Payment with this idempotency key is already in progress.");
      }
      // status === "failed" — allow retry
    }
  }

  const adapter = await getAdapter(walletId);
  const reason = options.reason ?? "x402 payment";

  const negotiation = await negotiate(url, options, walletId);

  if (negotiation.type === "passthrough") {
    return negotiation.response;
  }

  const { accepted, paymentRequired, service } = negotiation.result;
  const { evaluation } = negotiation;
  const ruleDecision = evaluation.decision;

  if (ruleDecision.decision === "block") {
    throw new Error(ruleDecision.reason);
  }

  if (ruleDecision.decision === "pending_approval") {
    // Check auto-approve before creating an ApprovalRequest
    const autoApproveResult = await checkAutoApprove(evaluation.ctx);
    if (autoApproveResult?.approved) {
      // Auto-approved — proceed with payment immediately (fall through to allow path)
      // We log the auto-approve in the reason for audit trail
    } else {
      // Manual approval required
      const entry = await resolveWalletEntry(walletId);
      const approval = await createApprovalRequest({
        walletId,
        agentName: entry.agentIdentity?.name ?? null,
        url,
        method: options.method ?? "GET",
        amount: formatUnits(BigInt(accepted.amount), 6),
        asset: accepted.asset,
        network: accepted.network,
        reason,
        ruleTriggered: ruleDecision.ruleName ?? "amount_threshold",
        requestHeaders: options.headers ?? {},
        requestBody: options.body,
        accepted,
        paymentRequired,
      });

      return {
        status: 202,
        headers: {},
        body: JSON.stringify({
          status: "pending_approval",
          approvalId: approval.id,
          reason: ruleDecision.reason,
          expiresAt: approval.expiresAt,
        }),
        pendingApproval: {
          approvalId: approval.id,
          reason: ruleDecision.reason,
          expiresAt: approval.expiresAt,
        },
      };
    }
  }

  // decision === "allow" — proceed with payment
  const payload = await signPayment(adapter, accepted);

  const txRecord = await addTransaction(
    {
      to: accepted.payTo,
      service,
      amount: formatUnits(BigInt(accepted.amount), 6),
      asset: accepted.asset,
      network: accepted.network,
      txHash: null,
      status: "pending",
      reason,
    },
    idempotencyKey,
    walletId,
  );

  return retryWithPayment(url, options, paymentRequired, accepted, payload, txRecord.id, walletId);
}

// ── Two-phase flow for browser wallets ───────────────────────────────

export async function x402Prepare(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    reason?: string;
  } = {},
  walletId?: string,
): Promise<{
  sessionId: string;
  domain: { name: string; version: string; chainId: number; verifyingContract: string };
  types: typeof TRANSFER_WITH_AUTHORIZATION_TYPES;
  primaryType: string;
  message: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
  };
  amount: string;
  payTo: string;
  network: string;
}> {
  if (!walletId) throw new Error("walletId is required for x402Prepare");
  const wallet = await getWallet(walletId);
  if (wallet.frozen) {
    throw new Error("Wallet is frozen. Unfreeze it before making payments.");
  }

  const adapter = await getAdapter(walletId);
  const reason = options.reason ?? "x402 payment";
  const entry = await resolveWalletEntry(walletId);

  const negotiation = await negotiate(url, options, walletId);

  if (negotiation.type === "passthrough") {
    throw new Error(
      `Server returned ${negotiation.response.status}, not a 402 Payment Required.`,
    );
  }

  const { accepted, paymentRequired, service } = negotiation.result;

  const fromAddress = adapter.getAddress();
  const domain = USDC_DOMAIN[accepted.network];
  if (!domain) {
    throw new Error(`No USDC domain config for network: ${accepted.network}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const nonce = ("0x" + randomBytes(32).toString("hex")) as Hex;
  const validAfter = now;
  const validBefore = now + accepted.maxTimeoutSeconds;

  const authorization: ExactEvmPayload["authorization"] = {
    from: fromAddress,
    to: accepted.payTo,
    value: accepted.amount,
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce,
  };

  const txRecord = await addTransaction({
    to: accepted.payTo,
    service,
    amount: formatUnits(BigInt(accepted.amount), 6),
    asset: accepted.asset,
    network: accepted.network,
    txHash: null,
    status: "pending",
    reason,
  }, undefined, walletId);

  // Store session in DB (durable)
  const sessionId = randomBytes(16).toString("hex");
  await db().paymentSession.create({
    data: {
      id: sessionId,
      walletId: entry.id,
      url,
      method: options.method ?? "GET",
      headers: JSON.stringify(options.headers ?? {}),
      body: options.body ?? null,
      reason,
      accepted: JSON.stringify(accepted),
      paymentRequired: JSON.stringify(paymentRequired),
      authorization: JSON.stringify(authorization),
      txRecordId: txRecord.id,
      expiresAt: validBefore,
    },
  });

  return {
    sessionId,
    domain: { ...domain },
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: fromAddress,
      to: accepted.payTo,
      value: accepted.amount,
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce,
    },
    amount: formatUnits(BigInt(accepted.amount), 6),
    payTo: accepted.payTo,
    network: accepted.network,
  };
}

export async function x402Complete(
  sessionId: string,
  signature: Hex,
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: string;
  payment?: { txHash: string | null; amount: string; to: Address };
}> {
  const row = await db().paymentSession.findUnique({ where: { id: sessionId } });
  if (!row) {
    throw new Error("Payment session not found or expired.");
  }

  const session = toPaymentSession(row);

  const now = Math.floor(Date.now() / 1000);
  if (now > session.expiresAt) {
    await db().paymentSession.delete({ where: { id: sessionId } });
    await updateTransaction(session.txRecordId, {
      status: "failed",
      reason: "Payment session expired",
    });
    throw new Error("Payment session expired. Please try again.");
  }

  // Clean up session immediately (one-time use)
  await db().paymentSession.delete({ where: { id: sessionId } });

  const payload: ExactEvmPayload = {
    signature,
    authorization: session.authorization,
  };

  return retryWithPayment(
    session.url,
    { method: session.method, headers: session.headers, body: session.body },
    session.paymentRequired,
    session.accepted,
    payload,
    session.txRecordId,
    session.walletId,
  );
}

// ── Approval Queue ───────────────────────────────────────────────────

const APPROVAL_TTL_MINUTES = 15;

interface CreateApprovalParams {
  walletId: string;
  agentName: string | null;
  url: string;
  method: string;
  amount: string;
  asset: string;
  network: string;
  reason: string;
  ruleTriggered: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  accepted: PaymentRequirements;
  paymentRequired: PaymentRequired;
}

async function createApprovalRequest(params: CreateApprovalParams) {
  const id = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MINUTES * 60 * 1000);

  const row = await db().approvalRequest.create({
    data: {
      id,
      walletId: params.walletId,
      agentName: params.agentName,
      url: params.url,
      method: params.method,
      amount: params.amount,
      asset: params.asset,
      network: params.network,
      reason: params.reason,
      ruleTriggered: params.ruleTriggered,
      status: "pending",
      expiresAt,
      requestHeaders: JSON.stringify(params.requestHeaders),
      requestBody: params.requestBody ?? null,
      accepted: JSON.stringify(params.accepted),
      paymentRequired: JSON.stringify(params.paymentRequired),
    },
  });

  return { id: row.id, expiresAt: row.expiresAt.toISOString() };
}

/**
 * Execute a payment that was previously held for approval.
 * Called when a human approves an ApprovalRequest.
 */
export async function executeApprovedPayment(
  approvalId: string,
  decidedBy?: string,
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: string;
  payment: { txHash: string | null; amount: string; to: Address };
}> {
  const row = await db().approvalRequest.findUnique({ where: { id: approvalId } });
  if (!row) throw new Error("Approval request not found");
  if (row.status !== "pending") throw new Error(`Approval is already ${row.status}`);
  if (new Date() > row.expiresAt) {
    await db().approvalRequest.update({
      where: { id: approvalId },
      data: { status: "expired" },
    });
    throw new Error("Approval request has expired");
  }

  // Mark as approved
  await db().approvalRequest.update({
    where: { id: approvalId },
    data: {
      status: "approved",
      decidedBy: decidedBy ?? "dashboard",
      decidedAt: new Date(),
    },
  });

  const walletId = row.walletId;
  const adapter = await getAdapter(walletId);
  if (!adapter.canSignServerSide) {
    throw new Error("Cannot execute approved payment — wallet requires browser signing");
  }

  const accepted = JSON.parse(row.accepted) as PaymentRequirements;
  const paymentRequired = JSON.parse(row.paymentRequired) as PaymentRequired;
  const requestHeaders = JSON.parse(row.requestHeaders) as Record<string, string>;

  // Sign and execute the payment
  const payload = await signPayment(adapter, accepted);

  const txRecord = await addTransaction(
    {
      to: accepted.payTo,
      service: new URL(row.url).hostname,
      amount: row.amount,
      asset: row.asset,
      network: row.network,
      txHash: null,
      status: "pending",
      reason: row.reason,
    },
    undefined,
    walletId,
  );

  return retryWithPayment(
    row.url,
    { method: row.method, headers: requestHeaders, body: row.requestBody ?? undefined },
    paymentRequired,
    accepted,
    payload,
    txRecord.id,
    walletId,
  );
}

/**
 * Reject a pending approval request.
 */
export async function rejectApproval(
  approvalId: string,
  decidedBy?: string,
): Promise<void> {
  const row = await db().approvalRequest.findUnique({ where: { id: approvalId } });
  if (!row) throw new Error("Approval request not found");
  if (row.status !== "pending") throw new Error(`Approval is already ${row.status}`);

  await db().approvalRequest.update({
    where: { id: approvalId },
    data: {
      status: "rejected",
      decidedBy: decidedBy ?? "dashboard",
      decidedAt: new Date(),
    },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

function findAcceptedOption(
  accepts: PaymentRequirements[],
): PaymentRequirements | null {
  for (const option of accepts) {
    if (option.scheme !== "exact") continue;
    const chainId = CHAIN_IDS[option.network];
    if (!chainId) continue;
    const expectedUsdc = USDC[option.network];
    if (
      expectedUsdc &&
      option.asset.toLowerCase() === expectedUsdc.toLowerCase()
    ) {
      return option;
    }
  }
  return null;
}

async function signPayment(
  adapter: WalletAdapter,
  requirements: PaymentRequirements,
): Promise<ExactEvmPayload> {
  const fromAddress = adapter.getAddress();
  const domain = USDC_DOMAIN[requirements.network];
  if (!domain) {
    throw new Error(`No USDC domain config for network: ${requirements.network}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const nonce = ("0x" + randomBytes(32).toString("hex")) as Hex;

  const authorization = {
    from: fromAddress,
    to: requirements.payTo,
    value: BigInt(requirements.amount),
    validAfter: BigInt(now),
    validBefore: BigInt(now + requirements.maxTimeoutSeconds),
    nonce,
  };

  const signature = await adapter.signTypedData({
    domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: authorization,
  });

  return {
    signature,
    authorization: {
      from: fromAddress,
      to: requirements.payTo,
      value: requirements.amount,
      validAfter: now.toString(),
      validBefore: (now + requirements.maxTimeoutSeconds).toString(),
      nonce,
    },
  };
}
