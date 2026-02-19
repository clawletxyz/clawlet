import { randomBytes } from "node:crypto";
import { getState, persist, requireActiveEntry, getActiveEntry, getNetworkCaip2 } from "./store.js";
import { DEFAULT_RULES } from "./types.js";
import type { WalletInfo, WalletEntry, AgentIdentity } from "./types.js";
import type { WalletAdapter } from "./adapters/types.js";
import { createAdapter, LocalKeyAdapter } from "./adapters/index.js";

/** In-memory cache of hydrated adapters, keyed by wallet entry id. */
const adapterCache = new Map<string, WalletAdapter>();

/** Get or restore the adapter for a wallet entry. */
function hydrateAdapter(entry: WalletEntry): WalletAdapter {
  const cached = adapterCache.get(entry.id);
  if (cached) return cached;
  const adapter = createAdapter(entry.adapterConfig);
  adapterCache.set(entry.id, adapter);
  return adapter;
}

/** Get the active wallet's adapter. */
export function getAdapter(): WalletAdapter {
  const entry = requireActiveEntry();
  return hydrateAdapter(entry);
}

/**
 * Create a new wallet and add it to the wallets list.
 * Automatically becomes the active wallet.
 */
export async function createWallet(
  adapterType?: string,
  credentials?: Record<string, string>,
  label?: string,
): Promise<WalletEntry> {
  let adapter: WalletAdapter;

  if (adapterType === "privy") {
    if (!credentials?.appId || !credentials?.appSecret)
      throw new Error("Privy requires appId and appSecret");
    const { PrivyAdapter } = await import("./adapters/index.js");
    adapter = new PrivyAdapter({ type: "privy", appId: credentials.appId, appSecret: credentials.appSecret });
  } else if (adapterType === "coinbase-cdp") {
    if (!credentials?.apiKeyId || !credentials?.apiKeySecret)
      throw new Error("Coinbase CDP requires apiKeyId and apiKeySecret");
    const { CoinbaseCdpAdapter } = await import("./adapters/index.js");
    adapter = new CoinbaseCdpAdapter({ type: "coinbase-cdp", apiKeyId: credentials.apiKeyId, apiKeySecret: credentials.apiKeySecret });
  } else if (adapterType === "crossmint") {
    if (!credentials?.apiKey)
      throw new Error("Crossmint requires apiKey");
    const { CrossmintAdapter } = await import("./adapters/index.js");
    adapter = new CrossmintAdapter({ type: "crossmint", apiKey: credentials.apiKey });
  } else if (adapterType === "browser") {
    if (!credentials?.address)
      throw new Error("Browser wallet requires an address");
    const { BrowserWalletAdapter } = await import("./adapters/index.js");
    adapter = new BrowserWalletAdapter({ type: "browser", address: credentials.address });
  } else {
    adapter = new LocalKeyAdapter();
  }

  const address = await adapter.createWallet();
  const state = getState();
  const id = randomBytes(8).toString("hex");
  const walletNum = state.wallets.length + 1;

  const entry: WalletEntry = {
    id,
    label: label || `Wallet ${walletNum}`,
    wallet: {
      address,
      createdAt: new Date().toISOString(),
      frozen: false,
    },
    adapterConfig: adapter.toJSON(),
    rules: { ...DEFAULT_RULES },
    transactions: [],
  };

  state.wallets.push(entry);
  state.activeWalletId = id;
  adapterCache.set(id, adapter);
  persist();

  return entry;
}

/** List all wallets. */
export function listWallets(): WalletEntry[] {
  return getState().wallets;
}

/** Switch the active wallet by id. */
export function switchWallet(walletId: string): WalletEntry {
  const state = getState();
  const entry = state.wallets.find((w) => w.id === walletId);
  if (!entry) throw new Error(`Wallet ${walletId} not found`);
  state.activeWalletId = walletId;
  persist();
  return entry;
}

/** Remove a wallet by id. */
export function removeWallet(walletId: string): void {
  const state = getState();
  const idx = state.wallets.findIndex((w) => w.id === walletId);
  if (idx === -1) throw new Error(`Wallet ${walletId} not found`);
  state.wallets.splice(idx, 1);
  adapterCache.delete(walletId);
  if (state.activeWalletId === walletId) {
    state.activeWalletId = state.wallets[0]?.id ?? null;
  }
  persist();
}

/** Load the current active wallet info or throw. */
export function getWallet(): WalletInfo {
  return requireActiveEntry().wallet;
}

/** Get USDC balance (human-readable) via the active adapter. */
export async function getBalance(network?: string): Promise<string> {
  const adapter = getAdapter();
  return adapter.getBalance(network ?? getNetworkCaip2());
}

/** Freeze the active wallet. */
export function freezeWallet(): void {
  const entry = requireActiveEntry();
  entry.wallet.frozen = true;
  persist();
}

/** Unfreeze the active wallet. */
export function unfreezeWallet(): void {
  const entry = requireActiveEntry();
  entry.wallet.frozen = false;
  persist();
}

/** Rename the active wallet. */
export function renameWallet(label: string): void {
  const entry = requireActiveEntry();
  entry.label = label;
  persist();
}

/** Set or update agent identity on the active wallet. */
export function setAgentIdentity(identity: AgentIdentity): void {
  const entry = requireActiveEntry();
  entry.agentIdentity = {
    ...entry.agentIdentity,
    ...identity,
  };
  persist();
}

/** Get agent identity from the active wallet, or null. */
export function getAgentIdentity(): AgentIdentity | null {
  const entry = getActiveEntry();
  return entry?.agentIdentity ?? null;
}

/** For configure_adapter flow (MCP): pre-configure an adapter, store it temporarily. */
let pendingAdapter: WalletAdapter | null = null;

export function setAdapter(adapter: WalletAdapter): void {
  pendingAdapter = adapter;
}

export function getPendingAdapter(): WalletAdapter | null {
  return pendingAdapter;
}

export function clearPendingAdapter(): void {
  pendingAdapter = null;
}
