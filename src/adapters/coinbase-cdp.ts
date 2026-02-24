import { hashTypedData, type Address, type Hex } from "viem";
import type { WalletAdapter, CoinbaseCdpConfig } from "./types.js";
import { getUsdcBalance } from "./evm-balance.js";

/**
 * Coinbase CDP v2 Adapter
 *
 * Uses @coinbase/cdp-sdk with TEE-based key management.
 * Accounts are idempotent (getOrCreateAccount) and work across all EVM networks.
 *
 * Requires: @coinbase/cdp-sdk
 * @see https://docs.cdp.coinbase.com
 */
export class CoinbaseCdpAdapter implements WalletAdapter {
  readonly type = "coinbase-cdp" as const;
  readonly canSignServerSide = true;
  private apiKeyId: string;
  private apiKeySecret: string;
  private walletSecret: string;
  private accountName: string;
  private address: Address | null;
  private cdpClient: unknown | null = null;

  constructor(config: CoinbaseCdpConfig) {
    this.apiKeyId = config.apiKeyId;
    this.apiKeySecret = config.apiKeySecret;
    this.walletSecret = config.walletSecret;
    this.accountName = config.accountName ?? "clawlet-default";
    this.address = (config.address as Address) ?? null;
  }

  private async getClient() {
    if (this.cdpClient) return this.cdpClient as any;
    try {
      const { CdpClient } = await import("@coinbase/cdp-sdk");
      this.cdpClient = new CdpClient({
        apiKeyId: this.apiKeyId,
        apiKeySecret: this.apiKeySecret,
        walletSecret: this.walletSecret,
      });
      return this.cdpClient as any;
    } catch {
      throw new Error(
        "Coinbase CDP SDK not installed. Run: npm install @coinbase/cdp-sdk",
      );
    }
  }

  async createWallet(): Promise<Address> {
    const cdp = await this.getClient();
    const account = await cdp.evm.getOrCreateAccount({
      name: this.accountName,
    });
    this.address = account.address as Address;
    return this.address;
  }

  getAddress(): Address {
    if (!this.address) throw new Error("No Coinbase CDP account initialized.");
    return this.address;
  }

  isInitialized(): boolean {
    return this.address !== null;
  }

  async getBalance(network: string): Promise<string> {
    return getUsdcBalance(this.getAddress(), network);
  }

  async signTypedData(params: {
    domain: { name: string; version: string; chainId: number; verifyingContract: Address };
    types: Record<string, readonly { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<Hex> {
    if (!this.address) throw new Error("No Coinbase CDP account initialized.");
    const cdp = await this.getClient();

    const hash = hashTypedData({
      domain: params.domain,
      types: params.types as Record<string, { name: string; type: string }[]>,
      primaryType: params.primaryType,
      message: params.message,
    });

    const result = await cdp.evm.signHash({
      address: this.address,
      hash,
    });

    return result.signature as Hex;
  }

  toJSON(): CoinbaseCdpConfig {
    return {
      type: "coinbase-cdp",
      apiKeyId: this.apiKeyId,
      apiKeySecret: this.apiKeySecret,
      walletSecret: this.walletSecret,
      accountName: this.accountName,
      address: this.address ?? undefined,
    };
  }
}
