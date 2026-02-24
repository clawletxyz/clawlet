import { initDb, db } from "./db.js";
import { toWalletEntry } from "./mappers.js";
import type { ClawletState, WalletEntry, NetworkId } from "./types.js";

/** In-memory cache for network so getNetworkCaip2 can stay sync. */
let cachedNetwork: NetworkId = "base";

export async function initStore(baseDir?: string): Promise<void> {
  await initDb(baseDir);

  const appState = await db().appState.findUnique({ where: { id: "singleton" } });
  cachedNetwork = (appState?.network as NetworkId) ?? "base";
}

export async function getState(): Promise<ClawletState> {
  const appState = await db().appState.findUniqueOrThrow({ where: { id: "singleton" } });
  const walletRows = await db().wallet.findMany({
    include: { transactions: { orderBy: { timestamp: "asc" } } },
  });

  return {
    wallets: walletRows.map(toWalletEntry),
    network: (appState.network as NetworkId) ?? "base",
  };
}

/** Look up a wallet by ID. Throws if not found. */
export async function getWalletById(walletId: string): Promise<WalletEntry> {
  const row = await db().wallet.findUnique({
    where: { id: walletId },
    include: { transactions: { orderBy: { timestamp: "asc" } } },
  });
  if (!row) throw new Error(`Wallet ${walletId} not found`);
  return toWalletEntry(row);
}

/** Resolve a wallet by explicit ID. */
export async function resolveWalletEntry(walletId: string): Promise<WalletEntry> {
  return getWalletById(walletId);
}

/** Get the selected network CAIP-2 id (sync, uses cache). */
export function getNetworkCaip2(): string {
  return cachedNetwork === "base-sepolia" ? "eip155:84532" : "eip155:8453";
}

/** Set the active network. */
export async function setNetwork(network: NetworkId): Promise<void> {
  await db().appState.update({
    where: { id: "singleton" },
    data: { network },
  });
  cachedNetwork = network;
}
