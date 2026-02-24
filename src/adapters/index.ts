export type {
  WalletAdapter,
  AdapterType,
  BuiltInAdapterType,
  AdapterConfig,
  LocalKeyConfig,
  CoinbaseCdpConfig,
  BrowserWalletConfig,
} from "./types.js";
export { LocalKeyAdapter } from "./local-key.js";
export { CoinbaseCdpAdapter } from "./coinbase-cdp.js";
export { BrowserWalletAdapter } from "./browser-wallet.js";

import type { AdapterConfig, WalletAdapter } from "./types.js";
import { LocalKeyAdapter } from "./local-key.js";
import { CoinbaseCdpAdapter } from "./coinbase-cdp.js";
import { BrowserWalletAdapter } from "./browser-wallet.js";

// ── Plugin Registry ───────────────────────────────────────────────────

type AdapterFactory = (config: AdapterConfig) => WalletAdapter;
const adapterRegistry = new Map<string, AdapterFactory>();

export function registerAdapter(type: string, factory: AdapterFactory): void {
  adapterRegistry.set(type, factory);
}

/** Create a wallet adapter from persisted config. */
export function createAdapter(config: AdapterConfig): WalletAdapter {
  // Check plugin registry first
  const custom = adapterRegistry.get(config.type);
  if (custom) return custom(config);

  switch (config.type) {
    case "local-key":
      return new LocalKeyAdapter(config);
    case "coinbase-cdp":
      return new CoinbaseCdpAdapter(config);
    case "browser":
      return new BrowserWalletAdapter(config);
    default:
      throw new Error(
        `Unknown adapter type: ${(config as { type: string }).type}`,
      );
  }
}
