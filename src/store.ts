import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_DATA_DIR, STATE_FILE } from "./constants.js";
import { DEFAULT_RULES } from "./types.js";
import type { ClawletState, LegacyClawletState, WalletEntry, NetworkId } from "./types.js";

let dataDir: string;
let statePath: string;
let state: ClawletState;

/** Detect and migrate v1 (single-wallet) state to v2 (multi-wallet). */
function migrateIfNeeded(raw: unknown): ClawletState {
  const obj = raw as Record<string, unknown>;

  // Already v2 — has wallets array
  if (Array.isArray(obj.wallets)) {
    return obj as unknown as ClawletState;
  }

  // v1 — single-wallet format
  const legacy = obj as unknown as LegacyClawletState;
  const wallets: WalletEntry[] = [];

  if (legacy.wallet && legacy.adapterConfig) {
    const id = randomBytes(8).toString("hex");
    wallets.push({
      id,
      label: "Wallet 1",
      wallet: legacy.wallet,
      adapterConfig: legacy.adapterConfig,
      rules: legacy.rules ?? { ...DEFAULT_RULES },
      transactions: legacy.transactions ?? [],
    });
  }

  return {
    wallets,
    activeWalletId: wallets[0]?.id ?? null,
    network: "base" as NetworkId,
  };
}

export function initStore(baseDir?: string): void {
  dataDir = baseDir
    ? join(baseDir, DEFAULT_DATA_DIR)
    : join(process.cwd(), DEFAULT_DATA_DIR);
  statePath = join(dataDir, STATE_FILE);

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  if (existsSync(statePath)) {
    const raw = JSON.parse(readFileSync(statePath, "utf-8"));
    state = migrateIfNeeded(raw);
    persist(); // write back migrated format
  } else {
    state = {
      wallets: [],
      activeWalletId: null,
      network: "base",
    };
    persist();
  }
}

export function getState(): ClawletState {
  return state;
}

export function persist(): void {
  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
}

/** Get the active wallet entry, or null if none. */
export function getActiveEntry(): WalletEntry | null {
  if (!state.activeWalletId) return null;
  return state.wallets.find((w) => w.id === state.activeWalletId) ?? null;
}

/** Get the active wallet entry, or throw. */
export function requireActiveEntry(): WalletEntry {
  const entry = getActiveEntry();
  if (!entry) throw new Error("No active wallet. Create or switch to a wallet first.");
  return entry;
}

/** Get the selected network CAIP-2 id. */
export function getNetworkCaip2(): string {
  return state.network === "base-sepolia" ? "eip155:84532" : "eip155:8453";
}

/** Set the active network. */
export function setNetwork(network: NetworkId): void {
  state.network = network;
  persist();
}
