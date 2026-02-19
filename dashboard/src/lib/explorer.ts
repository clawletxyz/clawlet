const EXPLORER_BASE_URLS: Record<string, string> = {
  "eip155:8453": "https://www.x402scan.com",
  "eip155:84532": "https://sepolia.basescan.org",
};

const X402SCAN_BASE = "https://www.x402scan.com";

/** Map dashboard NetworkId to CAIP-2 string */
function toCaip2(network: string): string {
  return network === "base-sepolia" ? "eip155:84532" : "eip155:8453";
}

/** Resolve the explorer base for a CAIP-2 or NetworkId string */
function resolveBase(network: string): string {
  // CAIP-2 format
  if (EXPLORER_BASE_URLS[network]) return EXPLORER_BASE_URLS[network];
  // NetworkId format
  if (network === "base-sepolia") return EXPLORER_BASE_URLS["eip155:84532"];
  if (network === "base") return EXPLORER_BASE_URLS["eip155:8453"];
  return X402SCAN_BASE;
}

export function explorerTxUrl(txHash: string, network?: string): string {
  const base = network ? resolveBase(network) : X402SCAN_BASE;
  return `${base}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string, network?: string): string {
  const base = network ? resolveBase(network) : X402SCAN_BASE;
  return `${base}/address/${address}`;
}

export function isTestnet(network: string): boolean {
  return network === "base-sepolia" || network.includes("84532");
}

export function explorerName(network?: string): string {
  if (!network) return "x402scan";
  if (isTestnet(network)) return "Basescan";
  return "x402scan";
}

/** Returns the x402 icon path for mainnet, or null for testnet */
export function explorerIcon(network?: string): string | null {
  if (!network || !isTestnet(network)) return "/providers/x402.svg";
  return null;
}

export { toCaip2 };
