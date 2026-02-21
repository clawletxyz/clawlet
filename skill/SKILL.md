---
name: clawlet
description: Spend controls for AI agents — USDC wallet on Base with x402 payments, spending rules, and transaction audit trail. Use when the user mentions payments, x402, USDC, agent wallet, spending limits, or wants to pay for API access.
license: MIT
metadata:
  version: "0.0.2"
---

# Clawlet

Spend controls for AI agents + x402 payments over HTTP.

Clawlet gives your agent a USDC wallet on Base with spending rules, x402 payment support, and a full audit trail. Everything runs locally.

## When to Use

- User wants to pay for access to an x402-enabled API
- User asks to create or manage an agent wallet
- User wants to set spending limits, daily caps, or service allowlists
- User wants to check balance, view transactions, or freeze a wallet
- User mentions USDC, x402, or paid API access

## When NOT to Use

- General HTTP requests that don't require payment
- Non-USDC or non-Base chain transactions
- Traditional payment processing (Stripe, PayPal)

## Setup

Clawlet must be running locally. Start it in a terminal:

```bash
npx clawlet
```

This starts the dashboard at `http://localhost:3000` and prints the MCP config.

### Connect via MCP

Add to your agent's MCP configuration:

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

Once connected, the agent has access to all Clawlet tools directly.

## Available Tools (15)

### Wallet Management

| Tool | Description |
|------|-------------|
| `create_wallet` | Create a new USDC wallet on Base. Supports local-key, Privy, Coinbase CDP, and Crossmint adapters. |
| `list_wallets` | List all wallets and show which one is active. |
| `switch_wallet` | Switch the active wallet by ID. |
| `get_wallet` | Get the current active wallet address and frozen status. |
| `configure_adapter` | Pre-configure a managed wallet provider with credentials. |

### Payments

| Tool | Description |
|------|-------------|
| `pay` | Make an x402 payment to a URL. Handles the 402 handshake, signs the USDC payment via ERC-3009, and returns the response. |
| `get_balance` | Check the USDC balance of the active wallet. |
| `set_network` | Switch between Base mainnet and Base Sepolia testnet. |

### Spending Rules

| Tool | Description |
|------|-------------|
| `set_spending_rules` | Configure per-transaction limits, daily caps, service allowlists, and blocklists. |
| `get_spending_rules` | View the current spending rules for the active wallet. |

### Controls

| Tool | Description |
|------|-------------|
| `freeze_wallet` | Emergency kill switch — immediately blocks all payments. |
| `unfreeze_wallet` | Re-enable payments after a freeze. |

### History and Identity

| Tool | Description |
|------|-------------|
| `get_transactions` | View the transaction history for the active wallet (newest first). |
| `set_agent_identity` | Bind an ERC-8004 on-chain agent identity to the wallet. |
| `get_agent_identity` | Retrieve the agent identity for the active wallet. |

## Procedure

### Making a payment

1. Ensure a wallet exists. If not, call `create_wallet`.
2. Check that the wallet is not frozen via `get_wallet`.
3. Optionally check `get_spending_rules` to confirm the payment will be allowed.
4. Call `pay` with the target URL. Clawlet handles the full 402 handshake:
   - Sends the initial request
   - Receives 402 Payment Required with payment details
   - Checks spending rules (per-tx limit, daily cap, allowlist/blocklist)
   - Signs an EIP-712 TransferWithAuthorization for the exact USDC amount
   - Retries the request with the payment signature
   - Logs the transaction
5. Return the API response to the user along with payment details.

### Setting up a new wallet

1. Call `create_wallet` with an optional label and adapter type.
2. Call `set_spending_rules` with appropriate limits.
3. Call `set_network` if targeting testnet (`base-sepolia`).
4. The wallet address needs to be funded with USDC on Base before payments can be made.

### Emergency procedures

1. Call `freeze_wallet` to immediately block all payments.
2. Call `get_transactions` to review recent activity.
3. Call `unfreeze_wallet` only when the situation is resolved.

## Wallet Adapters

| Adapter | Use Case |
|---------|----------|
| `local-key` | Development and testing (default). Generates a raw private key locally. |
| `privy` | Production server-side agents. SOC 2 compliant. Requires `configure_adapter` first. |
| `coinbase-cdp` | Production server-side agents. Coinbase custody. Requires `configure_adapter` first. |
| `crossmint` | Production server-side agents. Crossmint custody. Requires `configure_adapter` first. |

## Common Issues

- **"Wallet is frozen"**: Call `unfreeze_wallet` before attempting payments.
- **"Daily cap exceeded"**: The wallet has hit its daily spending limit. Wait until the next day or increase the cap via `set_spending_rules`.
- **"Service blocked"**: The target domain is on the blocklist. Update rules via `set_spending_rules`.
- **"Chain mismatch"**: The wallet network doesn't match the payment server's network. Use `set_network` to switch.
- **"Insufficient balance"**: Fund the wallet address with USDC on Base.

## Resources

- [Clawlet GitHub](https://github.com/clawletxyz/clawlet)
- [x402 Protocol](https://x402.org/)
- [MCP Documentation](https://modelcontextprotocol.io/)
- [Dashboard](http://localhost:3000) (when running locally)
