# @clawlet/sdk

**Agent SDK for [Clawlet](https://github.com/clawletxyz/clawlet) — x402 payments and spending controls for AI agents.**

A zero-dependency client that connects any AI agent to a running Clawlet instance. Provides a typed API and framework-agnostic tool definitions for OpenAI, Anthropic, LangChain, and any agent framework that supports function calling.

## Install

```bash
npm install @clawlet/sdk
```

Requires a running Clawlet instance (`npx clawlet` in another terminal).

## Quick start

```typescript
import { Clawlet } from "@clawlet/sdk";

const clawlet = new Clawlet(); // defaults to http://localhost:3000

// Create a wallet
await clawlet.createWallet({ label: "My Agent" });

// Set spending rules
await clawlet.setRules({
  maxPerTransaction: "5.00",
  dailyCap: "50.00",
});

// Make an x402 payment
const result = await clawlet.pay("https://api.example.com/premium-data");
console.log(result.body);    // the API response
console.log(result.payment); // { txHash, amount, service }

// Check balance
const { balance } = await clawlet.getBalance();
console.log(`${balance} USDC`);

// Emergency stop
await clawlet.freeze();
```

## Use with agent frameworks

The SDK provides tool definitions and an executor that work with any framework.

### OpenAI

```typescript
import OpenAI from "openai";
import { Clawlet, getToolDefinitions, createToolExecutor } from "@clawlet/sdk";

const openai = new OpenAI();
const clawlet = new Clawlet();
const execute = createToolExecutor(clawlet);

// Register tools
const tools = getToolDefinitions().map((t) => ({
  type: "function" as const,
  function: t,
}));

// In your agent loop, when the model calls a tool:
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages,
  tools,
});

for (const call of response.choices[0].message.tool_calls ?? []) {
  const result = await execute(call.function.name, JSON.parse(call.function.arguments));
  // Feed result back to the model...
}
```

### Anthropic

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { Clawlet, getToolDefinitions, createToolExecutor } from "@clawlet/sdk";

const anthropic = new Anthropic();
const clawlet = new Clawlet();
const execute = createToolExecutor(clawlet);

// Register tools
const tools = getToolDefinitions().map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters,
}));

const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages,
  tools,
});

for (const block of response.content) {
  if (block.type === "tool_use") {
    const result = await execute(block.name, block.input as Record<string, unknown>);
    // Feed result back...
  }
}
```

### Any framework

```typescript
import { getToolDefinitions, createToolExecutor, Clawlet } from "@clawlet/sdk";

// Get JSON Schema tool definitions (framework-agnostic)
const tools = getToolDefinitions();
// [{ name: "x402_fetch", description: "...", parameters: {...} }, ...]

// Create executor
const execute = createToolExecutor(new Clawlet());

// When your agent calls a tool:
const result = await execute("x402_fetch", {
  url: "https://api.example.com/data",
  reason: "Fetching market data",
});
```

## API reference

### `new Clawlet(options?)`

```typescript
const clawlet = new Clawlet();                          // localhost:3000
const clawlet = new Clawlet("http://localhost:4000");    // custom URL
const clawlet = new Clawlet({ baseUrl: "http://..." });  // options object
```

### Wallets

| Method | Description |
|--------|-------------|
| `createWallet(opts?)` | Create a new USDC wallet |
| `listWallets()` | List all wallets |
| `switchWallet(id)` | Switch the active wallet |
| `getWallet()` | Get the active wallet |
| `deleteWallet(id)` | Delete a wallet |

### Payments

| Method | Description |
|--------|-------------|
| `pay(url, opts?)` | Make an x402 payment to a URL |
| `fetch(url, opts?)` | Alias for `pay()` |

### Rules

| Method | Description |
|--------|-------------|
| `getRules()` | Get current spending rules |
| `setRules(rules)` | Update spending rules |

### Controls

| Method | Description |
|--------|-------------|
| `freeze()` | Freeze wallet — block all payments |
| `unfreeze()` | Unfreeze wallet |
| `getBalance(network?)` | Check USDC balance |
| `getNetwork()` | Get current network |
| `setNetwork(network)` | Switch Base mainnet / Sepolia |

### History

| Method | Description |
|--------|-------------|
| `getTransactions(limit?)` | Get transaction history |

### Identity

| Method | Description |
|--------|-------------|
| `getAgentIdentity()` | Get ERC-8004 agent identity |
| `setAgentIdentity(identity)` | Set agent identity |

## Available tools

The following tools are available via `getToolDefinitions()`:

| Tool | Description |
|------|-------------|
| `x402_fetch` | Make an x402 payment to any URL |
| `get_balance` | Check USDC balance |
| `set_spending_rules` | Configure limits and allowlists |
| `get_spending_rules` | View current rules |
| `get_transactions` | View transaction history |
| `freeze_wallet` | Emergency kill switch |
| `unfreeze_wallet` | Re-enable payments |
| `create_wallet` | Create a new wallet |
| `list_wallets` | List all wallets |
| `get_wallet` | Get active wallet info |

## Error handling

```typescript
import { Clawlet, ClawletError } from "@clawlet/sdk";

try {
  await clawlet.pay("https://api.example.com/data");
} catch (err) {
  if (err instanceof ClawletError) {
    console.log(err.status); // HTTP status code
    console.log(err.path);   // API endpoint that failed
    console.log(err.message); // Error description
  }
}
```

## License

MIT
