import { randomBytes } from "node:crypto";
import { formatUnits, type Hex, type Address } from "viem";
import {
  USDC,
  USDC_DOMAIN,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  CHAIN_IDS,
} from "./constants.js";
import { getWallet, getAdapter, getAgentIdentity } from "./wallet.js";
import { getNetworkCaip2 } from "./store.js";
import { enforceRules } from "./rules.js";
import { addTransaction, updateTransaction } from "./ledger.js";
import type {
  PaymentRequired,
  PaymentRequirements,
  PaymentPayload,
  ExactEvmPayload,
} from "./types.js";
import type { WalletAdapter } from "./adapters/types.js";

// ── In-memory session store for browser wallet two-phase flow ────────

interface PaymentSession {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  reason: string;
  accepted: PaymentRequirements;
  paymentRequired: PaymentRequired;
  authorization: ExactEvmPayload["authorization"];
  txRecordId: string;
  expiresAt: number;
}

const paymentSessions = new Map<string, PaymentSession>();

/** Remove expired sessions and mark their transactions as failed. */
function cleanupSessions(): void {
  const now = Math.floor(Date.now() / 1000);
  for (const [id, session] of paymentSessions) {
    if (now > session.expiresAt) {
      updateTransaction(session.txRecordId, {
        status: "failed",
        reason: "Payment session expired",
      });
      paymentSessions.delete(id);
    }
  }
}

// Sweep expired sessions every 60 seconds
setInterval(cleanupSessions, 60_000);

// ── Shared negotiate logic ───────────────────────────────────────────

interface NegotiateResult {
  accepted: PaymentRequirements;
  paymentRequired: PaymentRequired;
  service: string;
}

/**
 * Perform the initial 402 negotiation:
 * 1. Send initial request to URL
 * 2. Parse PAYMENT-REQUIRED header
 * 3. Find compatible payment option
 * 4. Network guard
 * 5. Enforce spending rules
 *
 * Returns null if the response is not 402 (caller should return the response directly).
 */
async function negotiate(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<
  | { type: "payment"; result: NegotiateResult }
  | { type: "passthrough"; response: { status: number; headers: Record<string, string>; body: string } }
> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { ...options.headers };

  // Step 1: Initial request
  const initialResponse = await fetch(url, {
    method,
    headers,
    body: options.body,
  });

  // Not a 402 — return as-is
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

  // Step 2: Parse PAYMENT-REQUIRED header
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

  // Step 3: Find a compatible payment option
  const accepted = findAcceptedOption(paymentRequired.accepts);
  if (!accepted) {
    throw new Error(
      `No compatible payment option found. Server accepts: ${JSON.stringify(paymentRequired.accepts.map((a) => ({ scheme: a.scheme, network: a.network, asset: a.asset })))}`,
    );
  }

  // Step 4: Network guard
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

  // Step 5: Enforce spending rules
  const service = new URL(url).hostname;
  enforceRules(accepted.amount, service);

  return {
    type: "payment",
    result: { accepted, paymentRequired, service },
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

  const agentIdentity = getAgentIdentity();

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

  // Extract payment receipt
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

  // Update transaction record
  if (retryResponse.ok) {
    updateTransaction(txRecordId, { status: "settled", txHash: txHash ?? undefined });
  } else {
    updateTransaction(txRecordId, { status: "failed" });
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

/**
 * Make an HTTP request to a URL, automatically handling x402 payment if required.
 * Works with adapters that can sign server-side (local-key, privy, coinbase-cdp, crossmint).
 * For browser wallets, use x402Prepare + x402Complete instead.
 */
export async function x402Fetch(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    reason?: string;
  } = {},
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: string;
  payment?: { txHash: string | null; amount: string; to: Address };
}> {
  const wallet = getWallet();
  if (wallet.frozen) {
    throw new Error("Wallet is frozen. Unfreeze it before making payments.");
  }

  const adapter = getAdapter();
  const reason = options.reason ?? "x402 payment";

  const negotiation = await negotiate(url, options);

  if (negotiation.type === "passthrough") {
    return negotiation.response;
  }

  const { accepted, paymentRequired, service } = negotiation.result;

  // Sign via adapter
  const payload = await signPayment(adapter, accepted);

  // Record pending transaction
  const txRecord = addTransaction({
    to: accepted.payTo,
    service,
    amount: formatUnits(BigInt(accepted.amount), 6),
    asset: accepted.asset,
    network: accepted.network,
    txHash: null,
    status: "pending",
    reason,
  });

  return retryWithPayment(url, options, paymentRequired, accepted, payload, txRecord.id);
}

// ── Two-phase flow for browser wallets ───────────────────────────────

/**
 * Phase 1: Negotiate payment and prepare EIP-712 signing data.
 * Does NOT sign — returns session + signing payload for the browser.
 */
export async function x402Prepare(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    reason?: string;
  } = {},
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
  const wallet = getWallet();
  if (wallet.frozen) {
    throw new Error("Wallet is frozen. Unfreeze it before making payments.");
  }

  const adapter = getAdapter();
  const reason = options.reason ?? "x402 payment";

  const negotiation = await negotiate(url, options);

  if (negotiation.type === "passthrough") {
    throw new Error(
      `Server returned ${negotiation.response.status}, not a 402 Payment Required.`,
    );
  }

  const { accepted, paymentRequired, service } = negotiation.result;

  // Generate EIP-712 data (same as signPayment but without signing)
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

  // Record pending transaction
  const txRecord = addTransaction({
    to: accepted.payTo,
    service,
    amount: formatUnits(BigInt(accepted.amount), 6),
    asset: accepted.asset,
    network: accepted.network,
    txHash: null,
    status: "pending",
    reason,
  });

  // Store session
  const sessionId = randomBytes(16).toString("hex");
  const session: PaymentSession = {
    id: sessionId,
    url,
    method: options.method ?? "GET",
    headers: { ...options.headers },
    body: options.body,
    reason,
    accepted,
    paymentRequired,
    authorization,
    txRecordId: txRecord.id,
    expiresAt: validBefore,
  };
  paymentSessions.set(sessionId, session);

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

/**
 * Phase 2: Accept browser-side signature, retry the original request.
 */
export async function x402Complete(
  sessionId: string,
  signature: Hex,
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: string;
  payment?: { txHash: string | null; amount: string; to: Address };
}> {
  const session = paymentSessions.get(sessionId);
  if (!session) {
    throw new Error("Payment session not found or expired.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > session.expiresAt) {
    paymentSessions.delete(sessionId);
    updateTransaction(session.txRecordId, {
      status: "failed",
      reason: "Payment session expired",
    });
    throw new Error("Payment session expired. Please try again.");
  }

  // Clean up session immediately (one-time use)
  paymentSessions.delete(sessionId);

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
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Find a payment option we can fulfill: scheme=exact, EVM network, USDC asset.
 */
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

/**
 * Create an EIP-712 TransferWithAuthorization signature via the wallet adapter.
 */
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
