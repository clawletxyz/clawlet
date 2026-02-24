#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initStore, setNetwork } from "./store.js";
import {
  createWallet, getWallet, getBalance, freezeWallet, unfreezeWallet,
  listWallets, setAdapter, setAgentIdentity, getAgentIdentity, getAdapter,
} from "./wallet.js";
import { setRules, getRules } from "./rules.js";
import { getTransactions } from "./ledger.js";
import { x402Fetch, executeApprovedPayment, rejectApproval } from "./x402.js";
import { db } from "./db.js";
import { toApprovalRequest } from "./mappers.js";
import { NETWORKS, X402SCAN_TX_URL, X402SCAN_ADDRESS_URL } from "./constants.js";
import { CoinbaseCdpAdapter } from "./adapters/index.js";

const server = new McpServer({
  name: "clawlet",
  version: "0.0.2",
});

/**
 * Resolve wallet ID: use provided ID, or fall back to the first wallet.
 */
async function resolveWalletIdForMcp(walletId?: string): Promise<string> {
  if (walletId) return walletId;
  const wallets = await listWallets();
  if (wallets.length === 0) throw new Error("No wallets found. Create a wallet first.");
  return wallets[0].id;
}

// ── configure_adapter ────────────────────────────────────────────────

server.tool(
  "configure_adapter",
  "Configure the Coinbase CDP wallet provider with credentials. Must be called before create_wallet for CDP wallets.",
  {
    adapter: z
      .string()
      .describe("The wallet provider to configure (e.g. 'coinbase-cdp')"),
    credentials: z
      .record(z.string())
      .describe(
        "Coinbase CDP credentials: {apiKeyId, apiKeySecret, walletSecret}.",
      ),
  },
  async ({ adapter, credentials }) => {
    if (!credentials.apiKeyId || !credentials.apiKeySecret || !credentials.walletSecret) {
      throw new Error("Coinbase CDP requires 'apiKeyId', 'apiKeySecret', and 'walletSecret' credentials.");
    }
    const walletAdapter = new CoinbaseCdpAdapter({
      type: "coinbase-cdp",
      apiKeyId: credentials.apiKeyId,
      apiKeySecret: credentials.apiKeySecret,
      walletSecret: credentials.walletSecret,
    });

    setAdapter(walletAdapter);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              adapter,
              status: "configured",
              note: `${adapter} adapter configured. Call create_wallet with adapter="${adapter}" to provision a wallet.`,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── create_wallet ───────────────────────────────────────────────────

server.tool(
  "create_wallet",
  "Create a new USDC wallet on Base for this agent. Supports multiple wallets.",
  {
    adapter: z
      .string()
      .default("local-key")
      .describe(
        "Wallet provider to use. Built-in: 'local-key' (default), 'coinbase-cdp' (requires configure_adapter first). Custom adapters supported via plugin registry.",
      ),
    label: z
      .string()
      .optional()
      .describe("Optional label for this wallet (e.g. 'Agent Wallet', 'Treasury')"),
  },
  async ({ adapter, label }) => {
    const entry = await createWallet(adapter, undefined, label);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              id: entry.id,
              label: entry.label,
              address: entry.wallet.address,
              createdAt: entry.wallet.createdAt,
              adapter,
              network: "Base (EVM)",
              asset: "USDC",
              note:
                adapter === "local-key"
                  ? "Fund this address with USDC on Base to enable payments."
                  : `Wallet provisioned via ${adapter}. Fund this address with USDC on Base to enable payments.`,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── list_wallets ────────────────────────────────────────────────────

server.tool(
  "list_wallets",
  "List all wallets.",
  {},
  async () => {
    const wallets = (await listWallets()).map((w) => ({
      id: w.id,
      label: w.label,
      address: w.wallet.address,
      frozen: w.wallet.frozen,
      adapter: w.adapterConfig.type,
    }));
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ count: wallets.length, wallets }, null, 2),
        },
      ],
    };
  },
);

// ── get_wallet ──────────────────────────────────────────────────────

server.tool(
  "get_wallet",
  "Get a wallet's address and status. Uses the first wallet if wallet_id is not provided.",
  {
    wallet_id: z.string().optional().describe("Wallet ID (defaults to first wallet)"),
  },
  async ({ wallet_id }) => {
    const wId = await resolveWalletIdForMcp(wallet_id);
    const wallet = await getWallet(wId);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              walletId: wId,
              address: wallet.address,
              frozen: wallet.frozen,
              createdAt: wallet.createdAt,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── get_balance ─────────────────────────────────────────────────────

server.tool(
  "get_balance",
  "Check the USDC balance of a wallet. Uses the first wallet if wallet_id is not provided.",
  {
    network: z
      .enum(["base", "base-sepolia"])
      .default("base")
      .describe("Network to check balance on"),
    wallet_id: z.string().optional().describe("Wallet ID (defaults to first wallet)"),
  },
  async ({ network, wallet_id }) => {
    const wId = await resolveWalletIdForMcp(wallet_id);
    const networkId =
      network === "base-sepolia" ? NETWORKS.BASE_SEPOLIA : NETWORKS.BASE_MAINNET;
    const balance = await getBalance(networkId, wId);
    const wallet = await getWallet(wId);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              walletId: wId,
              balance: `${balance} USDC`,
              network: networkId,
              address: wallet.address,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── set_spending_rules ──────────────────────────────────────────────

server.tool(
  "set_spending_rules",
  "Configure spending limits, approval thresholds, service allowlist, and blocklist for a wallet. Uses the first wallet if wallet_id is not provided.",
  {
    max_per_transaction: z
      .string()
      .optional()
      .describe("Max USDC per transaction (e.g. '5.00'). Null to remove."),
    daily_cap: z
      .string()
      .optional()
      .describe("Max USDC per day (e.g. '20.00'). Null to remove."),
    require_approval_above: z
      .string()
      .optional()
      .describe("Payments above this USDC amount require human approval (e.g. '1.00'). Null to remove."),
    allowed_services: z
      .array(z.string())
      .optional()
      .describe("List of allowed service domains (e.g. ['api.example.com']). Empty array to allow all."),
    blocked_services: z
      .array(z.string())
      .optional()
      .describe("List of blocked service domains (e.g. ['evil.com']). Checked before allowlist."),
    wallet_id: z.string().optional().describe("Wallet ID (defaults to first wallet)"),
  },
  async ({ max_per_transaction, daily_cap, require_approval_above, allowed_services, blocked_services, wallet_id }) => {
    const wId = await resolveWalletIdForMcp(wallet_id);
    const rules = await setRules({
      maxPerTransaction: max_per_transaction ?? undefined,
      dailyCap: daily_cap ?? undefined,
      requireApprovalAbove: require_approval_above ?? undefined,
      allowedServices: allowed_services ?? undefined,
      blockedServices: blocked_services ?? undefined,
    }, wId);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(rules, null, 2),
        },
      ],
    };
  },
);

// ── get_spending_rules ──────────────────────────────────────────────

server.tool(
  "get_spending_rules",
  "View the current spending rules for a wallet. Uses the first wallet if wallet_id is not provided.",
  {
    wallet_id: z.string().optional().describe("Wallet ID (defaults to first wallet)"),
  },
  async ({ wallet_id }) => {
    const wId = await resolveWalletIdForMcp(wallet_id);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(await getRules(wId), null, 2),
        },
      ],
    };
  },
);

// ── set_network ─────────────────────────────────────────────────────

server.tool(
  "set_network",
  "Switch between Base mainnet and Base Sepolia testnet.",
  {
    network: z
      .enum(["base", "base-sepolia"])
      .describe("Network to switch to"),
  },
  async ({ network }) => {
    await setNetwork(network);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ network, note: `Switched to ${network}` }, null, 2),
        },
      ],
    };
  },
);

// ── pay ─────────────────────────────────────────────────────────────

server.tool(
  "pay",
  "Make an x402 payment to a URL. Sends the request, handles the 402 handshake, signs the USDC payment, and returns the response. Uses the first wallet if wallet_id is not provided.",
  {
    url: z.string().url().describe("The URL to pay for access to"),
    method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET").describe("HTTP method"),
    body: z.string().optional().describe("Request body (for POST/PUT)"),
    headers: z
      .record(z.string())
      .optional()
      .describe("Additional request headers"),
    reason: z
      .string()
      .default("agent x402 payment")
      .describe("Human-readable reason for this payment (for audit trail)"),
    idempotency_key: z
      .string()
      .optional()
      .describe("Client-supplied idempotency key to prevent duplicate payments"),
    wallet_id: z.string().optional().describe("Wallet ID (defaults to first wallet)"),
  },
  async ({ url, method, body, headers, reason, idempotency_key, wallet_id }) => {
    const wId = await resolveWalletIdForMcp(wallet_id);
    const adapter = await getAdapter(wId);
    if (!adapter.canSignServerSide) {
      throw new Error(
        `Wallet ${wId} uses ${adapter.type} (browser signer) — cannot sign via MCP. Use a server-side wallet.`,
      );
    }
    const result = await x402Fetch(url, { method, body, headers, reason }, idempotency_key, wId);

    if (result.pendingApproval) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "pending_approval",
                approvalId: result.pendingApproval.approvalId,
                reason: result.pendingApproval.reason,
                expiresAt: result.pendingApproval.expiresAt,
                note: "This payment exceeds the approval threshold. A human must approve it via the dashboard or the approve_payment tool before it can proceed.",
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: result.status,
              body: result.body.slice(0, 4000),
              payment: result.payment ?? null,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── get_transactions ────────────────────────────────────────────────

server.tool(
  "get_transactions",
  "View the transaction history for a wallet. Uses the first wallet if wallet_id is not provided.",
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(20)
      .describe("Number of recent transactions to return"),
    wallet_id: z.string().optional().describe("Wallet ID (defaults to first wallet)"),
  },
  async ({ limit, wallet_id }) => {
    const wId = await resolveWalletIdForMcp(wallet_id);
    const txs = await getTransactions(limit, wId);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              count: txs.length,
              transactions: txs,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── freeze_wallet ───────────────────────────────────────────────────

server.tool(
  "freeze_wallet",
  "Emergency freeze — immediately blocks all payments from a wallet. Uses the first wallet if wallet_id is not provided.",
  {
    wallet_id: z.string().optional().describe("Wallet ID (defaults to first wallet)"),
  },
  async ({ wallet_id }) => {
    const wId = await resolveWalletIdForMcp(wallet_id);
    await freezeWallet(wId);
    return {
      content: [
        {
          type: "text" as const,
          text: "Wallet frozen. All payments are blocked until you call unfreeze_wallet.",
        },
      ],
    };
  },
);

// ── unfreeze_wallet ─────────────────────────────────────────────────

server.tool(
  "unfreeze_wallet",
  "Unfreeze a wallet to re-enable payments. Uses the first wallet if wallet_id is not provided.",
  {
    wallet_id: z.string().optional().describe("Wallet ID (defaults to first wallet)"),
  },
  async ({ wallet_id }) => {
    const wId = await resolveWalletIdForMcp(wallet_id);
    await unfreezeWallet(wId);
    return {
      content: [
        {
          type: "text" as const,
          text: "Wallet unfrozen. Payments are enabled.",
        },
      ],
    };
  },
);

// ── set_agent_identity ──────────────────────────────────────────────

server.tool(
  "set_agent_identity",
  "Set or update the ERC-8004 agent identity for a wallet. Uses the first wallet if wallet_id is not provided.",
  {
    name: z.string().describe("Agent name (e.g. 'ResearchBot', 'TradingAgent')"),
    description: z
      .string()
      .optional()
      .describe("Description of the agent's purpose"),
    agent_id: z
      .string()
      .optional()
      .describe("ERC-8004 agentId (tokenId) if already registered on-chain"),
    agent_registry: z
      .string()
      .optional()
      .describe("ERC-8004 registry address (e.g. 'eip155:8453:0x8004A169...')"),
    agent_uri: z
      .string()
      .optional()
      .describe("URI pointing to agent metadata (ipfs:// or https://)"),
    wallet_id: z.string().optional().describe("Wallet ID (defaults to first wallet)"),
  },
  async ({ name, description, agent_id, agent_registry, agent_uri, wallet_id }) => {
    const wId = await resolveWalletIdForMcp(wallet_id);
    await setAgentIdentity({
      name,
      description,
      agentId: agent_id,
      agentRegistry: agent_registry,
      agentURI: agent_uri,
    }, wId);
    const identity = await getAgentIdentity(wId);
    const wallet = await getWallet(wId);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              identity,
              x402scanUrl: X402SCAN_ADDRESS_URL(wallet.address),
              note: agent_id
                ? "Agent identity set with on-chain registration."
                : "Agent identity set. Register on-chain via ERC-8004 Identity Registry to get an agentId.",
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── get_agent_identity ─────────────────────────────────────────────

server.tool(
  "get_agent_identity",
  "Get the ERC-8004 agent identity for a wallet. Uses the first wallet if wallet_id is not provided.",
  {
    wallet_id: z.string().optional().describe("Wallet ID (defaults to first wallet)"),
  },
  async ({ wallet_id }) => {
    const wId = await resolveWalletIdForMcp(wallet_id);
    const identity = await getAgentIdentity(wId);
    const wallet = await getWallet(wId);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              identity,
              walletAddress: wallet.address,
              x402scanUrl: X402SCAN_ADDRESS_URL(wallet.address),
              registered: !!identity?.agentId,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── list_pending_approvals ────────────────────────────────────────────

server.tool(
  "list_pending_approvals",
  "List pending approval requests that need human review. Optionally filter by wallet.",
  {
    wallet_id: z.string().optional().describe("Filter by wallet ID (defaults to all wallets)"),
    status: z
      .enum(["pending", "approved", "rejected", "expired"])
      .default("pending")
      .describe("Filter by status"),
  },
  async ({ wallet_id, status }) => {
    const where: Record<string, unknown> = { status };
    if (wallet_id) where.walletId = wallet_id;

    const rows = await db().approvalRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const approvals = rows.map(toApprovalRequest);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              count: approvals.length,
              approvals: approvals.map((a) => ({
                id: a.id,
                walletId: a.walletId,
                agentName: a.agentName,
                url: a.url,
                amount: `${a.amount} ${a.asset}`,
                reason: a.reason,
                ruleTriggered: a.ruleTriggered,
                status: a.status,
                expiresAt: a.expiresAt,
                createdAt: a.createdAt,
              })),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── get_approval_status ──────────────────────────────────────────────

server.tool(
  "get_approval_status",
  "Get the status of a specific approval request.",
  {
    approval_id: z.string().describe("The approval request ID"),
  },
  async ({ approval_id }) => {
    const row = await db().approvalRequest.findUnique({ where: { id: approval_id } });
    if (!row) throw new Error("Approval request not found");

    const approval = toApprovalRequest(row);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(approval, null, 2),
        },
      ],
    };
  },
);

// ── approve_payment ──────────────────────────────────────────────────

server.tool(
  "approve_payment",
  "Approve a pending payment request. This will sign and execute the payment.",
  {
    approval_id: z.string().describe("The approval request ID to approve"),
    decided_by: z.string().default("mcp").describe("Who approved this (for audit trail)"),
  },
  async ({ approval_id, decided_by }) => {
    const result = await executeApprovedPayment(approval_id, decided_by);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: result.status,
              body: result.body.slice(0, 4000),
              payment: result.payment,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── reject_payment ───────────────────────────────────────────────────

server.tool(
  "reject_payment",
  "Reject a pending payment request.",
  {
    approval_id: z.string().describe("The approval request ID to reject"),
    decided_by: z.string().default("mcp").describe("Who rejected this (for audit trail)"),
  },
  async ({ approval_id, decided_by }) => {
    await rejectApproval(approval_id, decided_by);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { status: "rejected", approvalId: approval_id },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── set_auto_approve_policy ───────────────────────────────────────────

server.tool(
  "set_auto_approve_policy",
  "Set or update the auto-approve policy for a wallet. Payments that exceed the approval threshold but meet ALL auto-approve conditions will be approved automatically without human intervention.",
  {
    wallet_id: z.string().optional().describe("Wallet ID (defaults to first wallet)"),
    enabled: z.boolean().default(true).describe("Whether auto-approve is enabled"),
    max_amount: z.string().optional().describe("Max USDC per tx for auto-approve (e.g. '3.00')"),
    max_daily_count: z.number().int().optional().describe("Max auto-approved txs per day"),
    max_daily_amount: z.string().optional().describe("Max cumulative daily USDC for auto-approve (e.g. '10.00')"),
    service_pattern: z.string().optional().describe("Glob pattern for allowed services (e.g. '*.example.com')"),
  },
  async ({ wallet_id, enabled, max_amount, max_daily_count, max_daily_amount, service_pattern }) => {
    const wId = await resolveWalletIdForMcp(wallet_id);
    const policy = await db().autoApprovePolicy.upsert({
      where: { walletId: wId },
      create: {
        walletId: wId,
        enabled,
        maxAmount: max_amount ?? null,
        maxDailyCount: max_daily_count ?? null,
        maxDailyAmount: max_daily_amount ?? null,
        servicePattern: service_pattern ?? null,
      },
      update: {
        enabled,
        maxAmount: max_amount ?? null,
        maxDailyCount: max_daily_count ?? null,
        maxDailyAmount: max_daily_amount ?? null,
        servicePattern: service_pattern ?? null,
      },
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              policy,
              note: enabled
                ? "Auto-approve policy active. Payments meeting all conditions will skip the approval queue."
                : "Auto-approve policy saved but disabled.",
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── get_auto_approve_policy ──────────────────────────────────────────

server.tool(
  "get_auto_approve_policy",
  "View the auto-approve policy for a wallet.",
  {
    wallet_id: z.string().optional().describe("Wallet ID (defaults to first wallet)"),
  },
  async ({ wallet_id }) => {
    const wId = await resolveWalletIdForMcp(wallet_id);
    const policy = await db().autoApprovePolicy.findUnique({
      where: { walletId: wId },
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              walletId: wId,
              policy: policy ?? null,
              note: policy ? (policy.enabled ? "Auto-approve is active." : "Auto-approve policy exists but is disabled.") : "No auto-approve policy set for this wallet.",
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── remove_auto_approve_policy ───────────────────────────────────────

server.tool(
  "remove_auto_approve_policy",
  "Remove the auto-approve policy for a wallet. All payments requiring approval will go to the manual queue.",
  {
    wallet_id: z.string().optional().describe("Wallet ID (defaults to first wallet)"),
  },
  async ({ wallet_id }) => {
    const wId = await resolveWalletIdForMcp(wallet_id);
    try {
      await db().autoApprovePolicy.delete({ where: { walletId: wId } });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { walletId: wId, deleted: true, note: "Auto-approve policy removed." },
              null,
              2,
            ),
          },
        ],
      };
    } catch {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { walletId: wId, deleted: false, note: "No auto-approve policy found for this wallet." },
              null,
              2,
            ),
          },
        ],
      };
    }
  },
);

// ── Boot ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await initStore();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
