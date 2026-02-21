import { Clawlet } from "./client.js";
import type { PayOptions, CreateWalletOptions, SpendingRules, AgentIdentity } from "./types.js";

/**
 * Tool definition in OpenAI-compatible format.
 * Works with OpenAI, Anthropic (tool_use), LangChain, and most agent frameworks.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Returns Clawlet tool definitions in OpenAI function-calling format.
 * Use these to register Clawlet capabilities with any agent framework.
 */
export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "x402_fetch",
      description:
        "Make an x402 payment to a URL. Sends the request, handles the 402 payment handshake, signs the USDC payment, and returns the response.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to pay for access to" },
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "DELETE"],
            description: "HTTP method (default: GET)",
          },
          body: { type: "string", description: "Request body (for POST/PUT)" },
          headers: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "Additional request headers",
          },
          reason: {
            type: "string",
            description: "Human-readable reason for this payment (for audit trail)",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "get_balance",
      description: "Check the USDC balance of the active agent wallet.",
      parameters: {
        type: "object",
        properties: {
          network: {
            type: "string",
            enum: ["base", "base-sepolia"],
            description: "Network to check balance on",
          },
        },
      },
    },
    {
      name: "set_spending_rules",
      description: "Configure spending limits, service allowlist, and blocklist for the active wallet.",
      parameters: {
        type: "object",
        properties: {
          maxPerTransaction: {
            type: "string",
            description: "Max USDC per transaction (e.g. '5.00'). Null to remove.",
            nullable: true,
          },
          dailyCap: {
            type: "string",
            description: "Max USDC per day (e.g. '20.00'). Null to remove.",
            nullable: true,
          },
          allowedServices: {
            type: "array",
            items: { type: "string" },
            description: "Allowed service domains. Empty array to allow all.",
          },
          blockedServices: {
            type: "array",
            items: { type: "string" },
            description: "Blocked service domains. Checked before allowlist.",
          },
        },
      },
    },
    {
      name: "get_spending_rules",
      description: "View the current spending rules for the active wallet.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "get_transactions",
      description: "View the transaction history for the active wallet.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of recent transactions to return (default: 20, max: 200)",
          },
        },
      },
    },
    {
      name: "freeze_wallet",
      description: "Emergency freeze — immediately blocks all payments from the active wallet.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "unfreeze_wallet",
      description: "Unfreeze the active wallet to re-enable payments.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "create_wallet",
      description: "Create a new USDC wallet on Base for this agent.",
      parameters: {
        type: "object",
        properties: {
          adapter: {
            type: "string",
            enum: ["local-key", "privy", "coinbase-cdp", "crossmint"],
            description: "Wallet provider (default: local-key)",
          },
          label: { type: "string", description: "Optional label for this wallet" },
        },
      },
    },
    {
      name: "list_wallets",
      description: "List all wallets and show which one is active.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "get_wallet",
      description: "Get the current active wallet address and status.",
      parameters: { type: "object", properties: {} },
    },
  ];
}

/**
 * Creates a tool executor that maps tool names to Clawlet client calls.
 * Use this to handle tool invocations from any agent framework.
 *
 * @example
 * ```ts
 * const clawlet = new Clawlet();
 * const execute = createToolExecutor(clawlet);
 *
 * // When your agent calls a tool:
 * const result = await execute("x402_fetch", { url: "https://api.example.com/data" });
 * ```
 */
export function createToolExecutor(client: Clawlet) {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
    x402_fetch: async (args) =>
      client.pay(args.url as string, {
        method: args.method as PayOptions["method"],
        headers: args.headers as Record<string, string>,
        body: args.body as string,
        reason: args.reason as string,
      }),

    get_balance: async (args) =>
      client.getBalance(args.network as "base" | "base-sepolia" | undefined),

    set_spending_rules: async (args) =>
      client.setRules(args as Partial<SpendingRules>),

    get_spending_rules: async () =>
      client.getRules(),

    get_transactions: async (args) =>
      client.getTransactions(args.limit as number | undefined),

    freeze_wallet: async () =>
      client.freeze(),

    unfreeze_wallet: async () =>
      client.unfreeze(),

    create_wallet: async (args) =>
      client.createWallet(args as CreateWalletOptions),

    list_wallets: async () =>
      client.listWallets(),

    get_wallet: async () =>
      client.getWallet(),
  };

  return async (toolName: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    const handler = handlers[toolName];
    if (!handler) {
      throw new Error(`Unknown tool: ${toolName}. Available: ${Object.keys(handlers).join(", ")}`);
    }
    return handler(args);
  };
}
