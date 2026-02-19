import type { Address } from "viem";

// ── Networks ────────────────────────────────────────────────────────

export const NETWORKS = {
  BASE_MAINNET: "eip155:8453",
  BASE_SEPOLIA: "eip155:84532",
} as const;

export const CHAIN_IDS: Record<string, number> = {
  "eip155:8453": 8453,
  "eip155:84532": 84532,
};

// ── USDC Addresses ──────────────────────────────────────────────────

export const USDC: Record<string, Address> = {
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

// ── USDC EIP-712 Domain ─────────────────────────────────────────────

export const USDC_DOMAIN: Record<
  string,
  { name: string; version: string; chainId: number; verifyingContract: Address }
> = {
  "eip155:8453": {
    name: "USD Coin",
    version: "2",
    chainId: 8453,
    verifyingContract: USDC["eip155:8453"],
  },
  "eip155:84532": {
    name: "USDC",
    version: "2",
    chainId: 84532,
    verifyingContract: USDC["eip155:84532"],
  },
};

// ── ERC-3009 TransferWithAuthorization type ─────────────────────────

export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

// ── ERC-20 ABI (balanceOf + decimals) ───────────────────────────────

export const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ── RPC Endpoints ───────────────────────────────────────────────────

export const RPC_URLS: Record<string, string> = {
  "eip155:8453": "https://mainnet.base.org",
  "eip155:84532": "https://sepolia.base.org",
};

// ── Chain definitions (inline to avoid importing viem/chains barrel) ─

export const CHAINS: Record<number, {
  id: number;
  name: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: { default: { http: readonly string[] } };
}> = {
  8453: {
    id: 8453,
    name: "Base",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
  },
  84532: {
    id: 84532,
    name: "Base Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
  },
};

// ── Default data directory ──────────────────────────────────────────

export const DEFAULT_DATA_DIR = ".clawlet";
export const STATE_FILE = "state.json";

// ── ERC-8004 Identity Registry ─────────────────────────────────────

export const ERC8004_IDENTITY_REGISTRY: Record<string, Address> = {
  "eip155:8453": "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  "eip155:84532": "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
};

export const ERC8004_REPUTATION_REGISTRY: Record<string, Address> = {
  "eip155:8453": "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  "eip155:84532": "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
};

// ── Block Explorers ────────────────────────────────────────────────

export const EXPLORER_BASE_URLS: Record<string, string> = {
  "eip155:8453": "https://www.x402scan.com",
  "eip155:84532": "https://sepolia.basescan.org",
};

export const X402SCAN_BASE_URL = "https://www.x402scan.com";

export const EXPLORER_TX_URL = (txHash: string, network?: string) => {
  const base = network ? (EXPLORER_BASE_URLS[network] ?? X402SCAN_BASE_URL) : X402SCAN_BASE_URL;
  return `${base}/tx/${txHash}`;
};

export const EXPLORER_ADDRESS_URL = (address: string, network?: string) => {
  const base = network ? (EXPLORER_BASE_URLS[network] ?? X402SCAN_BASE_URL) : X402SCAN_BASE_URL;
  return `${base}/address/${address}`;
};

// Legacy aliases
export const X402SCAN_TX_URL = (txHash: string) =>
  EXPLORER_TX_URL(txHash);
export const X402SCAN_ADDRESS_URL = (address: string) =>
  EXPLORER_ADDRESS_URL(address);
