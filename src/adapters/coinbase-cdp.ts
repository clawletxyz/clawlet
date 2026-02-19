import { hashTypedData, type Address, type Hex } from "viem";
import type { WalletAdapter, CoinbaseCdpConfig } from "./types.js";
import { getUsdcBalance } from "./evm-balance.js";

/**
 * Coinbase CDP (Coinbase Developer Platform) Adapter
 *
 * Integrates with Coinbase's Agentic Wallets — purpose-built wallet
 * infrastructure for AI agents with native x402 support, spending limits,
 * and KYT screening. Uses server-signer mode so Coinbase manages keys.
 *
 * Requires: @coinbase/coinbase-sdk (install separately)
 * @see https://docs.cdp.coinbase.com
 */
export class CoinbaseCdpAdapter implements WalletAdapter {
  readonly type = "coinbase-cdp" as const;
  private apiKeyId: string;
  private apiKeySecret: string;
  private walletId: string | null;
  private address: Address | null;

  constructor(config: CoinbaseCdpConfig) {
    this.apiKeyId = config.apiKeyId;
    this.apiKeySecret = config.apiKeySecret;
    this.walletId = config.walletId ?? null;
    this.address = (config.address as Address) ?? null;
  }

  private async loadSdk() {
    try {
      return await import("@coinbase/coinbase-sdk");
    } catch {
      throw new Error(
        "Coinbase CDP SDK not installed. Run: npm install @coinbase/coinbase-sdk",
      );
    }
  }

  private async configureSdk() {
    const { Coinbase } = await this.loadSdk();
    Coinbase.configure({
      apiKeyName: this.apiKeyId,
      privateKey: this.apiKeySecret,
      useServerSigner: true,
    });
  }

  async createWallet(): Promise<Address> {
    await this.configureSdk();
    const { Wallet } = await this.loadSdk();

    const wallet = await Wallet.create({ networkId: "base-mainnet" });
    this.walletId = wallet.getId() ?? null;

    const defaultAddress = await wallet.getDefaultAddress();
    this.address = defaultAddress.getId() as Address;
    return this.address;
  }

  getAddress(): Address {
    if (!this.address) throw new Error("No Coinbase CDP wallet initialized.");
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
    if (!this.walletId) throw new Error("No Coinbase CDP wallet initialized.");
    await this.configureSdk();
    const { Wallet } = await this.loadSdk();

    // Hash the EIP-712 typed data locally using viem
    const hash = hashTypedData({
      domain: params.domain,
      types: params.types as Record<string, { name: string; type: string }[]>,
      primaryType: params.primaryType,
      message: params.message,
    });

    // Fetch the wallet and sign with server-signer
    const wallet = await Wallet.fetch(this.walletId);
    let payloadSignature = await wallet.createPayloadSignature(hash);
    payloadSignature = await payloadSignature.wait();

    return payloadSignature.getSignature() as Hex;
  }

  toJSON(): CoinbaseCdpConfig {
    return {
      type: "coinbase-cdp",
      apiKeyId: this.apiKeyId,
      apiKeySecret: this.apiKeySecret,
      walletId: this.walletId ?? undefined,
      address: this.address ?? undefined,
    };
  }
}
