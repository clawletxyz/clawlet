#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initStore, getState, setNetwork } from "./store.js";
import {
  createWallet, getWallet, getBalance, freezeWallet, unfreezeWallet,
  listWallets, switchWallet, setAdapter, setAgentIdentity, getAgentIdentity,
} from "./wallet.js";
import { setRules, getRules } from "./rules.js";
import { getTransactions } from "./ledger.js";
import { x402Fetch } from "./x402.js";
import { NETWORKS, X402SCAN_TX_URL, X402SCAN_ADDRESS_URL } from "./constants.js";
import { PrivyAdapter, CoinbaseCdpAdapter, CrossmintAdapter } from "./adapters/index.js";

const server = new McpServer({
  name: "clawlet",
  version: "0.0.2",
});

// ── configure_adapter ────────────────────────────────────────────────

server.tool(
  "configure_adapter",
  "Configure a managed wallet provider (Privy, Coinbase CDP, or Crossmint) with credentials. Must be called before create_wallet for managed adapters.",
  {
    adapter: z
      .enum(["privy", "coinbase-cdp", "crossmint"])
      .describe("The wallet provider to configure"),
    credentials: z
      .record(z.string())
      .describe(
        "Provider-specific credentials. Privy: {appId, appSecret}. Coinbase CDP: {apiKeyId, apiKeySecret}. Crossmint: {apiKey}.",
      ),
  },
  async ({ adapter, credentials }) => {
    let walletAdapter;

    switch (adapter) {
      case "privy":
        if (!credentials.appId || !credentials.appSecret) {
          throw new Error("Privy requires 'appId' and 'appSecret' credentials.");
        }
        walletAdapter = new PrivyAdapter({
          type: "privy",
          appId: credentials.appId,
          appSecret: credentials.appSecret,
        });
        break;
      case "coinbase-cdp":
        if (!credentials.apiKeyId || !credentials.apiKeySecret) {
          throw new Error("Coinbase CDP requires 'apiKeyId' and 'apiKeySecret' credentials.");
        }
        walletAdapter = new CoinbaseCdpAdapter({
          type: "coinbase-cdp",
          apiKeyId: credentials.apiKeyId,
          apiKeySecret: credentials.apiKeySecret,
        });
        break;
      case "crossmint":
        if (!credentials.apiKey) {
          throw new Error("Crossmint requires 'apiKey' credential.");
        }
        walletAdapter = new CrossmintAdapter({
          type: "crossmint",
          apiKey: credentials.apiKey,
        });
        break;
    }

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
  "Create a new USDC wallet on Base for this agent. Supports multiple wallets — each new wallet is added and becomes the active one.",
  {
    adapter: z
      .enum(["local-key", "privy", "coinbase-cdp", "crossmint"])
      .default("local-key")
      .describe(
        "Wallet provider to use. 'local-key' (default) generates a raw private key locally. Others require configure_adapter first.",
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
  "List all wallets and show which one is active.",
  {},
  async () => {
    const state = getState();
    const wallets = listWallets().map((w) => ({
      id: w.id,
      label: w.label,
      address: w.wallet.address,
      frozen: w.wallet.frozen,
      adapter: w.adapterConfig.type,
      active: w.id === state.activeWalletId,
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

// ── switch_wallet ───────────────────────────────────────────────────

server.tool(
  "switch_wallet",
  "Switch the active wallet by ID. Use list_wallets to see available wallet IDs.",
  {
    wallet_id: z.string().describe("The ID of the wallet to switch to"),
  },
  async ({ wallet_id }) => {
    const entry = switchWallet(wallet_id);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              activeWalletId: entry.id,
              label: entry.label,
              address: entry.wallet.address,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── get_wallet ──────────────────────────────────────────────────────

server.tool(
  "get_wallet",
  "Get the current active wallet address and status.",
  {},
  async () => {
    const wallet = getWallet();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
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
  "Check the USDC balance of the active agent wallet.",
  {
    network: z
      .enum(["base", "base-sepolia"])
      .default("base")
      .describe("Network to check balance on"),
  },
  async ({ network }) => {
    const networkId =
      network === "base-sepolia" ? NETWORKS.BASE_SEPOLIA : NETWORKS.BASE_MAINNET;
    const balance = await getBalance(networkId);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              balance: `${balance} USDC`,
              network: networkId,
              address: getWallet().address,
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
  "Configure spending limits, service allowlist, and blocklist for the active wallet.",
  {
    max_per_transaction: z
      .string()
      .optional()
      .describe("Max USDC per transaction (e.g. '5.00'). Null to remove."),
    daily_cap: z
      .string()
      .optional()
      .describe("Max USDC per day (e.g. '20.00'). Null to remove."),
    allowed_services: z
      .array(z.string())
      .optional()
      .describe("List of allowed service domains (e.g. ['api.example.com']). Empty array to allow all."),
    blocked_services: z
      .array(z.string())
      .optional()
      .describe("List of blocked service domains (e.g. ['evil.com']). Checked before allowlist."),
  },
  async ({ max_per_transaction, daily_cap, allowed_services, blocked_services }) => {
    const rules = setRules({
      maxPerTransaction: max_per_transaction ?? undefined,
      dailyCap: daily_cap ?? undefined,
      allowedServices: allowed_services ?? undefined,
      blockedServices: blocked_services ?? undefined,
    });
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
  "View the current spending rules for the active wallet.",
  {},
  async () => {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(getRules(), null, 2),
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
    setNetwork(network);
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
  "Make an x402 payment to a URL. Sends the request, handles the 402 handshake, signs the USDC payment, and returns the response.",
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
  },
  async ({ url, method, body, headers, reason }) => {
    const result = await x402Fetch(url, { method, body, headers, reason });
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
  "View the transaction history for the active wallet.",
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(20)
      .describe("Number of recent transactions to return"),
  },
  async ({ limit }) => {
    const txs = getTransactions(limit);
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
  "Emergency freeze — immediately blocks all payments from the active wallet.",
  {},
  async () => {
    freezeWallet();
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
  "Unfreeze the active wallet to re-enable payments.",
  {},
  async () => {
    unfreezeWallet();
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
  "Set or update the ERC-8004 agent identity for the active wallet. This binds a verifiable on-chain identity to the wallet for x402 payments.",
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
  },
  async ({ name, description, agent_id, agent_registry, agent_uri }) => {
    setAgentIdentity({
      name,
      description,
      agentId: agent_id,
      agentRegistry: agent_registry,
      agentURI: agent_uri,
    });
    const identity = getAgentIdentity();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              identity,
              x402scanUrl: X402SCAN_ADDRESS_URL(getWallet().address),
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
  "Get the ERC-8004 agent identity for the active wallet.",
  {},
  async () => {
    const identity = getAgentIdentity();
    const wallet = getWallet();
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

// ── Boot ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  initStore();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
