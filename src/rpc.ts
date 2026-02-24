import { RPC_URLS } from "./constants.js";

// ── RPC URL resolution ──────────────────────────────────────────────

function getRpcUrl(network: string): string {
  // Env var overrides
  if (network.includes("84532") && process.env.BASE_SEPOLIA_RPC_URL) {
    return process.env.BASE_SEPOLIA_RPC_URL;
  }
  if (network.includes("8453") && !network.includes("84532") && process.env.BASE_MAINNET_RPC_URL) {
    return process.env.BASE_MAINNET_RPC_URL;
  }
  const url = RPC_URLS[network];
  if (!url) throw new Error(`No RPC URL for network: ${network}`);
  return url;
}

// ── JSON-RPC call with retry ────────────────────────────────────────

async function rpcCall(
  network: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const url = getRpcUrl(network);
  const backoffs = [500, 1000, 2000];

  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      }),
    });

    if (res.status === 429 || res.status >= 500) {
      if (attempt < backoffs.length) {
        await new Promise((r) => setTimeout(r, backoffs[attempt]));
        continue;
      }
    }

    const json = (await res.json()) as { result?: unknown; error?: { message: string } };
    if (json.error) {
      throw new Error(`RPC error (${method}): ${json.error.message}`);
    }
    return json.result;
  }

  throw new Error(`RPC call ${method} failed after retries`);
}

// ── Public API ──────────────────────────────────────────────────────

export interface TransactionReceipt {
  blockNumber: number;
  status: "0x0" | "0x1";
}

export async function getTransactionReceipt(
  network: string,
  txHash: string,
): Promise<TransactionReceipt | null> {
  const result = await rpcCall(network, "eth_getTransactionReceipt", [txHash]);
  if (!result) return null;
  const receipt = result as { blockNumber: string; status: string };
  return {
    blockNumber: parseInt(receipt.blockNumber, 16),
    status: receipt.status as "0x0" | "0x1",
  };
}

export async function getBlockNumber(network: string): Promise<number> {
  const result = await rpcCall(network, "eth_blockNumber", []);
  return parseInt(result as string, 16);
}
