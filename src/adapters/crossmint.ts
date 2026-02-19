import type { Address, Hex } from "viem";
import type { WalletAdapter, CrossmintConfig } from "./types.js";
import { getUsdcBalance } from "./evm-balance.js";

/** Map chain IDs to Crossmint chain names. */
const CROSSMINT_CHAINS: Record<number, string> = {
  8453: "base",
  84532: "base-sepolia",
};

/**
 * Crossmint Agent Wallet Adapter
 *
 * Integrates with Crossmint's Agent Wallet API — purpose-built for
 * deploying wallets for AI agents with built-in compliance (VASP,
 * SOC2 II, GDPR). Stablecoin-native with USDC orchestration.
 *
 * Requires: @crossmint/wallets-sdk (install separately)
 * @see https://docs.crossmint.com/wallets/quickstarts/agent-wallets
 */
export class CrossmintAdapter implements WalletAdapter {
  readonly type = "crossmint" as const;
  private apiKey: string;
  private walletId: string | null;
  private address: Address | null;

  constructor(config: CrossmintConfig) {
    this.apiKey = config.apiKey;
    this.walletId = config.walletId ?? null;
    this.address = (config.address as Address) ?? null;
  }

  private async loadSdk() {
    try {
      return await import("@crossmint/wallets-sdk");
    } catch {
      throw new Error(
        "Crossmint SDK not installed. Run: npm install @crossmint/wallets-sdk",
      );
    }
  }

  private async createWalletsSdk() {
    const { createCrossmint, CrossmintWallets } = await this.loadSdk();
    const crossmint = createCrossmint({ apiKey: this.apiKey });
    return CrossmintWallets.from(crossmint);
  }

  async createWallet(): Promise<Address> {
    const wallets = await this.createWalletsSdk();
    const wallet = await wallets.createWallet({
      chain: "base",
      signer: { type: "api-key" as const },
    });

    this.address = wallet.address as Address;
    this.walletId = wallet.address; // Crossmint uses address as wallet locator
    return this.address;
  }

  getAddress(): Address {
    if (!this.address) throw new Error("No Crossmint wallet initialized.");
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
    if (!this.walletId) throw new Error("No Crossmint wallet initialized.");
    const { EVMWallet } = await this.loadSdk();

    const chain = CROSSMINT_CHAINS[params.domain.chainId];
    if (!chain) {
      throw new Error(
        `Unsupported chain ID for Crossmint: ${params.domain.chainId}`,
      );
    }

    // Get the wallet object back from Crossmint
    const wallets = await this.createWalletsSdk();
    const wallet = await wallets.getWallet(this.walletId, {
      chain: chain as any,
      signer: { type: "api-key" as const },
    });

    const evmWallet = EVMWallet.from(wallet);

    const result = await evmWallet.signTypedData({
      chain: chain as any,
      domain: params.domain,
      types: params.types as any,
      primaryType: params.primaryType,
      message: params.message,
    });

    return result.signature as Hex;
  }

  toJSON(): CrossmintConfig {
    return {
      type: "crossmint",
      apiKey: this.apiKey,
      walletId: this.walletId ?? undefined,
      address: this.address ?? undefined,
    };
  }
}
