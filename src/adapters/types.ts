import type { Address, Hex } from "viem";

// ── Adapter Types ───────────────────────────────────────────────────

export type BuiltInAdapterType = "local-key" | "coinbase-cdp" | "browser";
export type AdapterType = BuiltInAdapterType | (string & {});

/** Persisted configuration for each adapter type. */
export type AdapterConfig =
  | LocalKeyConfig
  | CoinbaseCdpConfig
  | BrowserWalletConfig;

export interface LocalKeyConfig {
  type: "local-key";
  privateKey: Hex;
}

export interface CoinbaseCdpConfig {
  type: "coinbase-cdp";
  apiKeyId: string;
  apiKeySecret: string;
  walletSecret: string;
  accountName?: string;
  address?: string;
}

export interface BrowserWalletConfig {
  type: "browser";
  address: string;
}

// ── Wallet Adapter Interface ────────────────────────────────────────

/**
 * Abstraction layer for wallet providers.
 *
 * Each adapter handles: create wallet, get balance, sign transaction.
 * Clawlet core (rules engine, x402 flow, ledger) works identically
 * regardless of which adapter is active.
 */
export interface WalletAdapter {
  readonly type: AdapterType;
  readonly canSignServerSide: boolean;

  /** Create or provision a new wallet. Returns the wallet address. */
  createWallet(): Promise<Address>;

  /** Get the wallet address. Throws if not initialized. */
  getAddress(): Address;

  /** Check if this adapter has an active wallet. */
  isInitialized(): boolean;

  /** Get USDC balance on a network (human-readable string like "12.50"). */
  getBalance(network: string): Promise<string>;

  /**
   * Sign EIP-712 typed data.
   * Used for TransferWithAuthorization (ERC-3009) in x402 payments.
   */
  signTypedData(params: {
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: Address;
    };
    types: Record<string, readonly { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<Hex>;

  /** Export adapter-specific config for persistence. */
  toJSON(): AdapterConfig;
}
