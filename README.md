# Clawlet

**Spend controls for AI agents + x402 payments over HTTP.**

One package. One command. Your AI agent gets a USDC wallet on Base with spending rules, x402 payment support, and a full audit trail — all running on your machine.

<!-- TODO: uncomment when screenshot is ready -->
<!-- ![Clawlet Dashboard](https://raw.githubusercontent.com/clawletxyz/clawlet/main/docs/screenshot.png) -->

## Quickstart

```bash
npx clawlet
```

That's it. Opens a dashboard at `http://localhost:3000` where you create a wallet, set spending rules, and view transactions. The CLI also prints the MCP config snippet to connect Claude Desktop.

### Install globally (optional)

```bash
npm install -g clawlet
clawlet start
```

## Connect your AI agent

Clawlet runs an MCP server that gives any compatible AI agent financial tools. Add this to your Claude Desktop config:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "clawlet": {
      "command": "npx",
      "args": ["-y", "clawlet", "mcp"]
    }
  }
}
```

Once connected, your agent has these tools:

| Tool | What it does |
|------|-------------|
| `create_wallet` | Create a new USDC wallet on Base |
| `list_wallets` | List all wallets, show which is active |
| `switch_wallet` | Switch the active wallet |
| `get_wallet` | Get active wallet address and status |
| `get_balance` | Check USDC balance |
| `set_spending_rules` | Set per-tx limit, daily cap, service allow/blocklists |
| `get_spending_rules` | View current rules |
| `set_network` | Switch between Base mainnet and Base Sepolia testnet |
| `pay` | Make an x402 payment to any URL |
| `get_transactions` | View transaction history |
| `freeze_wallet` | Emergency kill switch — blocks all payments instantly |
| `unfreeze_wallet` | Re-enable payments |
| `set_agent_identity` | Bind an ERC-8004 on-chain identity to the wallet |
| `get_agent_identity` | Retrieve agent identity |
| `configure_adapter` | Configure a managed wallet provider (Privy, CDP, Crossmint) |

### Example conversation

```
You:   Create a wallet for this agent
Agent: [calls create_wallet] → Created wallet 0xABC...123 on Base.

You:   Set a $5 per transaction limit and $20 daily cap
Agent: [calls set_spending_rules] → Rules updated.

You:   Access the premium data at https://api.example.com/data
Agent: [calls pay] → Paid 0.10 USDC to api.example.com. Here's the data: {...}

You:   Something's wrong — freeze the wallet
Agent: [calls freeze_wallet] → Wallet frozen. All payments blocked.
```

## How x402 payments work

```
Agent                     Clawlet                   Paid API
  |                          |                          |
  |--- pay(url) ----------->|                          |
  |                          |--- GET url ------------->|
  |                          |<-- 402 Payment Required -|
  |                          |                          |
  |                    Check spending rules             |
  |                    Sign ERC-3009 payment            |
  |                          |                          |
  |                          |--- GET url + signature ->|
  |                          |<-- 200 OK + response ----|
  |                          |                          |
  |                    Log transaction                  |
  |<-- response + receipt ---|                          |
```

1. Agent calls `pay` with a URL
2. Clawlet sends the request, gets `402 Payment Required` with payment details
3. Spending rules are checked (per-tx limit, daily cap, allowlist/blocklist, frozen status)
4. Clawlet signs an EIP-712 `TransferWithAuthorization` (ERC-3009) for the exact USDC amount
5. Retries the request with the payment signature
6. Server verifies, settles on-chain, returns the response
7. Transaction is logged with hash, amount, service, and reason

The agent never touches private keys. Clawlet handles all cryptographic operations.

## Wallet adapters

Clawlet supports multiple wallet providers through a common adapter interface:

| Adapter | Type | Custody | Use case |
|---------|------|---------|----------|
| `local-key` | Self-custodial | You | Development, testing, full control |
| `privy` | Managed | Privy (SOC 2) | Production server-side agents |
| `coinbase-cdp` | Managed | Coinbase | Production server-side agents |
| `crossmint` | Managed | Crossmint | Production server-side agents |
| `browser-wallet` | Browser | MetaMask, etc. | Dashboard payments via browser extension |

The default adapter (`local-key`) generates a private key locally — no third-party dependency. For production deployments, configure a managed adapter:

```
You:   Configure Privy as the wallet provider
Agent: [calls configure_adapter] → Privy configured.

You:   Create a new wallet
Agent: [calls create_wallet with adapter="privy"] → Wallet provisioned via Privy.
```

## CLI

```
clawlet                Start the dashboard and API server
clawlet start          Same as above
clawlet mcp            Start the MCP server (stdio transport)

Options:
  --port <number>      Port for the dashboard (default: 3000)
  --help, -h           Show help
  --version, -v        Show version
```

## Architecture

```
src/
├── cli.ts         # CLI entry point (npx clawlet)
├── index.ts       # MCP server — tool definitions, stdio transport
├── api.ts         # REST API + dashboard server (Hono)
├── wallet.ts      # Multi-wallet management, freeze/unfreeze
├── rules.ts       # Spending rules engine
├── ledger.ts      # Transaction recording
├── x402.ts        # x402 protocol handler (EIP-712 signing, two-phase for browser wallets)
├── store.ts       # JSON file persistence (.clawlet/state.json)
├── types.ts       # TypeScript type definitions
├── constants.ts   # Network addresses, ABIs, RPC URLs
└── adapters/
    ├── local-key.ts      # Raw private key (dev/testing)
    ├── privy.ts          # Privy Server Wallets
    ├── coinbase-cdp.ts   # Coinbase CDP
    ├── crossmint.ts      # Crossmint
    ├── browser-wallet.ts # MetaMask / browser extension
    └── evm-balance.ts    # Shared ERC-20 balance lookup

dashboard/             # React + Vite monitoring UI
demo/                  # Mock x402 server + seed data
```

## Development

```bash
git clone https://github.com/clawletxyz/clawlet.git
cd clawlet
npm install

# Seed sample data and run with hot reload
npm run demo:seed
npm run dev

# Run with mock x402 server (API + dashboard + mock paid endpoints)
npm run demo

# Build everything
npm run build
```

The mock x402 server runs on `localhost:4020` with test endpoints:

| Endpoint | Price |
|----------|-------|
| `/api/joke` | 0.01 USDC |
| `/api/weather` | 0.05 USDC |
| `/api/market-data` | 0.10 USDC |
| `/api/sentiment` | 0.02 USDC |
| `/api/code-review` | 0.25 USDC |

## Networks

| Network | Chain ID | USDC Address |
|---------|----------|-------------|
| Base Mainnet | `eip155:8453` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base Sepolia | `eip155:84532` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

Switch networks via the dashboard or MCP:

```
Agent: [calls set_network with network="base-sepolia"] → Switched to testnet.
```

## Security

- Private keys are stored locally in `.clawlet/state.json` (gitignored)
- The wallet only signs ERC-3009 `TransferWithAuthorization` — the facilitator can only execute the exact transfer described
- Spending rules are enforced before any signature is created
- Freeze blocks all payments instantly, no confirmation needed
- Managed adapters (Privy, CDP, Crossmint) never expose keys to Clawlet

## REST API

The dashboard server also exposes a full REST API at the same port:

```
GET    /api/wallets           List all wallets
POST   /api/wallets           Create a new wallet
POST   /api/wallets/switch    Switch active wallet
GET    /api/balance            Get USDC balance
GET    /api/rules              Get spending rules
PUT    /api/rules              Update spending rules
GET    /api/transactions       Get transaction history
POST   /api/pay                Make an x402 payment
POST   /api/freeze             Freeze active wallet
POST   /api/unfreeze           Unfreeze active wallet
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Stack

- [MCP](https://modelcontextprotocol.io/) — Model Context Protocol for agent tool communication
- [Hono](https://hono.dev/) — lightweight web framework for the REST API
- [viem](https://viem.sh/) — EVM interactions and EIP-712 signing
- [x402](https://x402.org/) — HTTP-native payment protocol
- USDC on [Base](https://base.org/) — settlement layer

## License

MIT
