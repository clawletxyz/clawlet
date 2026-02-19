import type { Address, Hex } from "viem";
import type { WalletAdapter, PrivyConfig } from "./types.js";
import { getUsdcBalance } from "./evm-balance.js";

/**
 * Privy Server Wallet Adapter
 *
 * Integrates with Privy's server-side wallet infrastructure (now Stripe).
 * Privy manages key custody so the agent never touches raw private keys.
 * 75M+ wallets, SOC 2 compliant.
 *
 * Requires: @privy-io/server-auth (install separately)
 * @see https://docs.privy.io/guide/server-wallets
 */
export class PrivyAdapter implements WalletAdapter {
  readonly type = "privy" as const;
  private appId: string;
  private appSecret: string;
  private walletId: string | null;
  private address: Address | null;

  constructor(config: PrivyConfig) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.walletId = config.walletId ?? null;
    this.address = (config.address as Address) ?? null;
  }

  private async createClient() {
    try {
      const { PrivyClient } = await import("@privy-io/server-auth");
      return new PrivyClient(this.appId, this.appSecret);
    } catch {
      throw new Error(
        "Privy SDK not installed. Run: npm install @privy-io/server-auth",
      );
    }
  }

  async createWallet(): Promise<Address> {
    const privy = await this.createClient();
    const wallet = await privy.walletApi.create({ chainType: "ethereum" });
    this.walletId = wallet.id;
    this.address = wallet.address as Address;
    return this.address;
  }

  getAddress(): Address {
    if (!this.address) throw new Error("No Privy wallet initialized.");
    return this.address;
  }

  isInitialized(): boolean {
    return this.walletId !== null && this.address !== null;
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
    if (!this.walletId) throw new Error("No Privy wallet initialized.");
    const privy = await this.createClient();

    // Convert BigInt values to strings for JSON serialization over the wire
    const serializedMessage: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params.message)) {
      serializedMessage[key] = typeof value === "bigint" ? value.toString() : value;
    }

    const result = await privy.walletApi.ethereum.signTypedData({
      walletId: this.walletId,
      typedData: {
        domain: params.domain,
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          ...params.types,
        },
        primaryType: params.primaryType,
        message: serializedMessage,
      },
    });

    return result.signature as Hex;
  }

  toJSON(): PrivyConfig {
    return {
      type: "privy",
      appId: this.appId,
      appSecret: this.appSecret,
      walletId: this.walletId ?? undefined,
      address: this.address ?? undefined,
    };
  }
}
