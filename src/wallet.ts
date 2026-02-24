import { randomBytes } from "node:crypto";
import { db } from "./db.js";
import { getNetworkCaip2, resolveWalletEntry } from "./store.js";
import { toWalletEntry } from "./mappers.js";
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

/** Get the wallet's adapter. walletId is required. */
export async function getAdapter(walletId: string): Promise<WalletAdapter> {
  const entry = await resolveWalletEntry(walletId);
  return hydrateAdapter(entry);
}

/**
 * Create a new wallet and add it to the wallets list.
 * Returns the new wallet entry (caller decides whether to make it "active" in the UI).
 */
export async function createWallet(
  adapterType?: string,
  credentials?: Record<string, string>,
  label?: string,
): Promise<WalletEntry> {
  let adapter: WalletAdapter;

  // Consume a pre-configured adapter (from MCP configure_adapter flow)
  const pending = getPendingAdapter();
  if (pending && (!adapterType || pending.type === adapterType)) {
    adapter = pending;
    clearPendingAdapter();
  } else if (adapterType === "coinbase-cdp") {
    if (!credentials?.apiKeyId || !credentials?.apiKeySecret || !credentials?.walletSecret)
      throw new Error("Coinbase CDP requires apiKeyId, apiKeySecret, and walletSecret");
    const { CoinbaseCdpAdapter } = await import("./adapters/index.js");
    adapter = new CoinbaseCdpAdapter({
      type: "coinbase-cdp",
      apiKeyId: credentials.apiKeyId,
      apiKeySecret: credentials.apiKeySecret,
      walletSecret: credentials.walletSecret,
    });
  } else if (adapterType === "browser") {
    if (!credentials?.address)
      throw new Error("Browser wallet requires an address");
    const { BrowserWalletAdapter } = await import("./adapters/index.js");
    adapter = new BrowserWalletAdapter({ type: "browser", address: credentials.address });
  } else {
    adapter = new LocalKeyAdapter();
  }

  let address: string;
  try {
    address = await adapter.createWallet();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (adapter.type === "coinbase-cdp") {
      throw new Error(`Failed to provision CDP wallet — check credentials. ${msg}`);
    }
    throw err;
  }
  const id = randomBytes(8).toString("hex");
  const walletCount = await db().wallet.count();
  const walletNum = walletCount + 1;

  const adapterConfig = adapter.toJSON();

  const row = await db().wallet.create({
    data: {
      id,
      label: label || `Wallet ${walletNum}`,
      address,
      createdAt: new Date(),
      frozen: false,
      adapterType: adapterConfig.type,
      adapterConfig: JSON.stringify(adapterConfig),
      maxPerTransaction: DEFAULT_RULES.maxPerTransaction,
      dailyCap: DEFAULT_RULES.dailyCap,
      allowedServices: JSON.stringify(DEFAULT_RULES.allowedServices),
      blockedServices: JSON.stringify(DEFAULT_RULES.blockedServices),
    },
    include: { transactions: true },
  });

  adapterCache.set(id, adapter);

  return toWalletEntry(row);
}

/** List all wallets. */
export async function listWallets(): Promise<WalletEntry[]> {
  const rows = await db().wallet.findMany({
    include: { transactions: { orderBy: { timestamp: "asc" } } },
  });
  return rows.map(toWalletEntry);
}

/** Remove a wallet by id. */
export async function removeWallet(walletId: string): Promise<void> {
  const existing = await db().wallet.findUnique({ where: { id: walletId } });
  if (!existing) throw new Error(`Wallet ${walletId} not found`);

  await db().wallet.delete({ where: { id: walletId } });
  adapterCache.delete(walletId);
}

/** Load the wallet info. walletId is required. */
export async function getWallet(walletId: string): Promise<WalletInfo> {
  const entry = await resolveWalletEntry(walletId);
  return entry.wallet;
}

/** Get USDC balance (human-readable) via the adapter. walletId is required. */
export async function getBalance(network: string, walletId: string): Promise<string> {
  const adapter = await getAdapter(walletId);
  return adapter.getBalance(network ?? getNetworkCaip2());
}

/** Freeze a wallet. walletId is required. */
export async function freezeWallet(walletId: string): Promise<void> {
  const entry = await resolveWalletEntry(walletId);
  await db().wallet.update({
    where: { id: entry.id },
    data: { frozen: true },
  });
}

/** Unfreeze a wallet. walletId is required. */
export async function unfreezeWallet(walletId: string): Promise<void> {
  const entry = await resolveWalletEntry(walletId);
  await db().wallet.update({
    where: { id: entry.id },
    data: { frozen: false },
  });
}

/** Rename a wallet. walletId is required. */
export async function renameWallet(label: string, walletId: string): Promise<void> {
  const entry = await resolveWalletEntry(walletId);
  await db().wallet.update({
    where: { id: entry.id },
    data: { label },
  });
}

/** Set or update agent identity on a wallet. walletId is required. */
export async function setAgentIdentity(identity: AgentIdentity, walletId: string): Promise<void> {
  const entry = await resolveWalletEntry(walletId);
  const existing = entry.agentIdentity;

  await db().wallet.update({
    where: { id: entry.id },
    data: {
      agentName: identity.name ?? existing?.name ?? null,
      agentDescription: identity.description ?? existing?.description ?? null,
      agentId: identity.agentId ?? existing?.agentId ?? null,
      agentRegistry: identity.agentRegistry ?? existing?.agentRegistry ?? null,
      agentURI: identity.agentURI ?? existing?.agentURI ?? null,
    },
  });
}

/** Get agent identity from a wallet, or null. walletId is required. */
export async function getAgentIdentity(walletId: string): Promise<AgentIdentity | null> {
  const entry = await resolveWalletEntry(walletId);
  return entry.agentIdentity ?? null;
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
