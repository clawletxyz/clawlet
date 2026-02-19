import type { Address, Hex } from "viem";
import type { WalletAdapter, BrowserWalletConfig } from "./types.js";
import { getUsdcBalance } from "./evm-balance.js";

/**
 * Browser wallet adapter (MetaMask, etc.).
 *
 * Stores an externally-provided address for balance lookups and
 * transaction tracking. Signing must happen client-side in the
 * browser — the server cannot access the private key.
 */
export class BrowserWalletAdapter implements WalletAdapter {
  readonly type = "browser" as const;
  private _address: Address | null;

  constructor(config?: BrowserWalletConfig) {
    this._address = (config?.address as Address) ?? null;
  }

  async createWallet(): Promise<Address> {
    if (!this._address) {
      throw new Error("Browser wallet requires an address from MetaMask.");
    }
    return this._address;
  }

  getAddress(): Address {
    if (!this._address) throw new Error("No browser wallet connected.");
    return this._address;
  }

  isInitialized(): boolean {
    return this._address !== null;
  }

  async getBalance(network: string): Promise<string> {
    return getUsdcBalance(this.getAddress(), network);
  }

  async signTypedData(): Promise<Hex> {
    throw new Error(
      "Browser wallet signing must be done client-side via MetaMask. " +
        "Use /api/pay/prepare and /api/pay/complete for two-phase payment.",
    );
  }

  toJSON(): BrowserWalletConfig {
    return { type: "browser", address: this.getAddress() };
  }
}
