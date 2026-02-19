export type {
  WalletAdapter,
  AdapterType,
  AdapterConfig,
  LocalKeyConfig,
  PrivyConfig,
  CoinbaseCdpConfig,
  CrossmintConfig,
  BrowserWalletConfig,
} from "./types.js";
export { LocalKeyAdapter } from "./local-key.js";
export { PrivyAdapter } from "./privy.js";
export { CoinbaseCdpAdapter } from "./coinbase-cdp.js";
export { CrossmintAdapter } from "./crossmint.js";
export { BrowserWalletAdapter } from "./browser-wallet.js";

import type { AdapterConfig, WalletAdapter } from "./types.js";
import { LocalKeyAdapter } from "./local-key.js";
import { PrivyAdapter } from "./privy.js";
import { CoinbaseCdpAdapter } from "./coinbase-cdp.js";
import { CrossmintAdapter } from "./crossmint.js";
import { BrowserWalletAdapter } from "./browser-wallet.js";

/** Create a wallet adapter from persisted config. */
export function createAdapter(config: AdapterConfig): WalletAdapter {
  switch (config.type) {
    case "local-key":
      return new LocalKeyAdapter(config);
    case "privy":
      return new PrivyAdapter(config);
    case "coinbase-cdp":
      return new CoinbaseCdpAdapter(config);
    case "crossmint":
      return new CrossmintAdapter(config);
    case "browser":
      return new BrowserWalletAdapter(config);
    default:
      throw new Error(
        `Unknown adapter type: ${(config as { type: string }).type}`,
      );
  }
}
