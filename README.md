# Clawlet

**Spend controls for AI agents + x402 payments over HTTP.**

Programmable USDC wallet for AI agents on Base. MCP server that gives any AI agent a financial identity with spending rules, x402 payment support, and a full audit trail.

<!-- TODO: replace with actual screenshot -->
<!-- ![Clawlet Dashboard](https://raw.githubusercontent.com/clawletxyz/clawlet/main/docs/screenshot.png) -->

<!-- TODO: uncomment when live demo is deployed -->
<!-- **[Live Demo](https://demo.clawlet.xyz)** -->

## What it does

- **Create a wallet** — one command, USDC on Base
- **Set spending rules** — per-transaction limits, daily caps, service whitelists
- **Pay via x402** — agent hits a paid URL, Clawlet handles the 402 handshake and signs the USDC payment automatically
- **Transaction log** — every payment recorded with timestamp, amount, service, reason
- **Human override** — freeze/unfreeze the wallet instantly

## Quickstart

```bash
git clone https://github.com/clawletxyz/clawlet.git
cd clawlet
npm install
npm run build
npm run demo:seed
npm run dev
```

Open `http://localhost:3000` — the dashboard loads with sample wallets, transactions, and spending rules.

To test the full x402 payment loop with the mock server:

```bash
npm run demo
```

This starts the API, dashboard, and a mock x402 server concurrently. Hit "Quick Payment" in the dashboard to see the full 402 handshake.

## Add to your MCP client

Add Clawlet to your MCP client configuration (e.g. Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "clawlet": {
      "command": "node",
      "args": ["/path/to/clawlet/dist/index.js"]
    }
  }
}
```

Once connected, your AI agent has these tools:

| Tool | Description |
|------|-------------|
| `create_wallet` | Create a new USDC wallet on Base |
| `get_wallet` | Get wallet address and status |
| `get_balance` | Check USDC balance (Base or Base Sepolia) |
| `set_spending_rules` | Set per-tx limit, daily cap, allowed services |
| `get_spending_rules` | View current rules |
| `pay` | Make an x402 payment to any URL |
| `get_transactions` | View transaction history |
| `freeze_wallet` | Emergency kill switch |
| `unfreeze_wallet` | Re-enable payments |

### Example conversation

```
You: Create a wallet for this agent
Agent: [calls create_wallet] Created wallet 0xABC...123 on Base.

You: Set a $5 per transaction limit and $20 daily cap
Agent: [calls set_spending_rules] Rules updated.

You: Access the premium data at https://api.example.com/data
Agent: [calls pay] Paid 0.10 USDC to api.example.com. Response: {...}

You: Show me all transactions
Agent: [calls get_transactions] 1 transaction: 0.10 USDC to api.example.com at 2026-02-12T...
```

## How x402 payments work

1. Agent sends a request to a URL
2. Server responds with `402 Payment Required` + payment details in the `PAYMENT-REQUIRED` header
3. Clawlet checks spending rules, signs an EIP-712 `TransferWithAuthorization` (ERC-3009)
4. Retries the request with the `PAYMENT-SIGNATURE` header
5. Server verifies and settles the USDC payment on-chain
6. Agent gets the response + Clawlet logs the transaction

The agent never touches private keys directly. Clawlet handles all cryptographic operations.

## Architecture

```
src/
├── index.ts       # MCP server — tool definitions and transport
├── api.ts         # REST API + dashboard server
├── wallet.ts      # Wallet creation, balance checks, freeze/unfreeze
├── rules.ts       # Spending rules engine (per-tx, daily, whitelist)
├── ledger.ts      # Transaction recording and retrieval
├── x402.ts        # x402 protocol handler (402 handshake + EIP-712 signing)
├── store.ts       # JSON file persistence
├── types.ts       # TypeScript type definitions
├── constants.ts   # Network addresses, ABIs, RPC URLs
└── adapters/      # Wallet adapters (local-key, Privy, Coinbase CDP, Crossmint, browser)

dashboard/         # React + Vite monitoring UI
demo/              # Mock x402 server + seed data for testing
```

State is persisted to `.clawlet/state.json` in the working directory.

## Development

```bash
# Seed sample data then run API + dashboard (hot reload)
npm run demo:seed && npm run dev

# Run with mock x402 server (API + dashboard + x402 mock)
npm run demo

# Build everything
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

## Networks

| Network | USDC Address |
|---------|-------------|
| Base Mainnet | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base Sepolia | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

## Security

- Private keys are stored locally in `.clawlet/state.json` — this file is gitignored
- The wallet only signs ERC-3009 `TransferWithAuthorization` — the facilitator can only execute the exact transfer described
- Spending rules are enforced before any signature is created
- Freeze instantly blocks all payments

## Stack

- [MCP](https://modelcontextprotocol.io/) — Model Context Protocol for agent tool communication
- [viem](https://viem.sh/) — EVM interactions and EIP-712 signing
- [x402](https://x402.org/) — HTTP-native payment protocol
- USDC on [Base](https://base.org/) — settlement layer

## License

MIT
