import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import type { WalletInfo, SpendingRules, TransactionRecord, WalletSummary, NetworkId, AgentIdentity } from "../types";

// Base chain IDs for MetaMask
const CHAIN_HEX: Record<NetworkId, string> = {
  base: "0x2105",          // 8453
  "base-sepolia": "0x14a34", // 84532
};

const CHAIN_ID_TO_NETWORK: Record<string, NetworkId> = {
  "0x2105": "base",
  "0x14a34": "base-sepolia",
};

/** Ask MetaMask to switch chains. Silently fails if MetaMask is unavailable. */
async function switchMetaMaskChain(net: NetworkId): Promise<void> {
  if (typeof window === "undefined" || !window.ethereum) return;
  const chainId = CHAIN_HEX[net];
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (err: unknown) {
    // 4902 = chain not added — try adding it
    const code = (err as { code?: number }).code;
    if (code === 4902) {
      const isTestnet = net === "base-sepolia";
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId,
          chainName: isTestnet ? "Base Sepolia" : "Base",
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: [isTestnet ? "https://sepolia.base.org" : "https://mainnet.base.org"],
          blockExplorerUrls: [isTestnet ? "https://sepolia.basescan.org" : "https://basescan.org"],
        }],
      });
    }
    // Other errors (user rejected, etc.) — ignore silently
  }
}

export function useClawlet() {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [walletLabel, setWalletLabel] = useState<string | null>(null);
  const [adapterType, setAdapterType] = useState<string | null>(null);
  const [wallets, setWallets] = useState<WalletSummary[]>([]);
  const [balance, setBalance] = useState("—");
  const [rules, setRules] = useState<SpendingRules | null>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [todaySpent, setTodaySpent] = useState("0.0");
  const [network, setNetworkState] = useState<NetworkId>("base");
  const [agentIdentity, setAgentIdentityState] = useState<AgentIdentity | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const refreshCount = useRef(0);

  // Fetch demo mode flag once on mount
  useEffect(() => {
    api<{ demoMode: boolean }>("/api/config")
      .then((cfg) => setDemoMode(cfg.demoMode))
      .catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([
      api<{ wallet: WalletInfo | null; adapter: string | null; id?: string; label?: string }>("/api/wallet"),
      api<{ balance: string }>("/api/balance"),
      api<SpendingRules>("/api/rules"),
      api<{ transactions: TransactionRecord[] }>("/api/transactions?limit=50"),
      api<{ spent: string }>("/api/today-spent"),
      api<{ wallets: WalletSummary[]; activeWalletId: string | null }>("/api/wallets"),
      api<{ network: NetworkId }>("/api/network"),
      api<{ identity: AgentIdentity | null }>("/api/agent-identity"),
    ]);

    if (results[0].status === "fulfilled") {
      setWallet(results[0].value.wallet);
      setAdapterType(results[0].value.adapter);
      setWalletId(results[0].value.id ?? null);
      setWalletLabel(results[0].value.label ?? null);
    }
    if (results[1].status === "fulfilled") {
      setBalance(results[1].value.balance);
    }
    if (results[2].status === "fulfilled") {
      setRules(results[2].value);
    }
    if (results[3].status === "fulfilled") {
      setTransactions(results[3].value.transactions || []);
    }
    if (results[4].status === "fulfilled") {
      setTodaySpent(results[4].value.spent);
    }
    if (results[5].status === "fulfilled") {
      setWallets(results[5].value.wallets);
    }
    if (results[6].status === "fulfilled") {
      setNetworkState(results[6].value.network);
    }
    if (results[7].status === "fulfilled") {
      setAgentIdentityState(results[7].value.identity);
    }

    setLastUpdated(new Date());
    refreshCount.current += 1;
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Listen for MetaMask chain changes and sync the dashboard network
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const handleChainChanged = async (...args: unknown[]) => {
      const chainIdHex = args[0] as string;
      if (typeof chainIdHex !== "string") return;
      const normalized = chainIdHex.toLowerCase();
      const net = CHAIN_ID_TO_NETWORK[normalized];
      if (!net) return; // Unsupported chain — ignore

      // Update backend + local state
      try {
        await api("/api/network", {
          method: "POST",
          body: JSON.stringify({ network: net }),
        });
        setNetworkState(net);
        await refresh();
      } catch {
        // Silently ignore — next poll will pick it up
      }
    };

    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, [refresh]);

  const freeze = async () => {
    await api("/api/freeze", { method: "POST" });
    setWallet((prev) => (prev ? { ...prev, frozen: true } : null));
  };

  const unfreeze = async () => {
    await api("/api/unfreeze", { method: "POST" });
    setWallet((prev) => (prev ? { ...prev, frozen: false } : null));
  };

  const saveRules = async (newRules: SpendingRules) => {
    const updated = await api<SpendingRules>("/api/rules", {
      method: "PUT",
      body: JSON.stringify(newRules),
    });
    setRules(updated);
  };

  const createNewWallet = async (
    adapter: string,
    credentials?: Record<string, string>,
    label?: string,
  ) => {
    await api("/api/wallets", {
      method: "POST",
      body: JSON.stringify({ adapter, credentials, label }),
    });
    await refresh();
  };

  const switchWalletFn = async (targetWalletId: string) => {
    await api("/api/wallets/switch", {
      method: "POST",
      body: JSON.stringify({ walletId: targetWalletId }),
    });
    await refresh();
  };

  const setNetworkFn = async (net: NetworkId) => {
    await api("/api/network", {
      method: "POST",
      body: JSON.stringify({ network: net }),
    });
    setNetworkState(net);
    // Sync MetaMask chain if available (fire-and-forget)
    switchMetaMaskChain(net).catch(() => {});
    await refresh();
  };

  const removeWalletFn = async (targetWalletId: string) => {
    await api(`/api/wallets/${targetWalletId}`, { method: "DELETE" });
    await refresh();
  };

  const renameWalletFn = async (label: string) => {
    await api("/api/wallets/rename", {
      method: "POST",
      body: JSON.stringify({ label }),
    });
    await refresh();
  };

  const saveAgentIdentity = async (identity: Partial<AgentIdentity>) => {
    const result = await api<{ identity: AgentIdentity }>("/api/agent-identity", {
      method: "POST",
      body: JSON.stringify(identity),
    });
    setAgentIdentityState(result.identity);
  };

  // ── Payment: two-phase flow for browser wallets ──────────

  type PayResult = {
    status: number;
    body: string | null;
    payment: { txHash: string | null; amount: string; to: string } | null;
    error?: string;
  };

  interface PrepareResult {
    sessionId: string;
    domain: { name: string; version: string; chainId: number; verifyingContract: string };
    types: Record<string, { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, string>;
    amount: string;
    payTo: string;
    network: string;
    error?: string;
  }

  const preparePayment = async (url: string, method = "GET"): Promise<PrepareResult> => {
    return api<PrepareResult>("/api/pay/prepare", {
      method: "POST",
      body: JSON.stringify({ url, method }),
    });
  };

  const completePayment = async (sessionId: string, signature: string): Promise<PayResult> => {
    const result = await api<PayResult>("/api/pay/complete", {
      method: "POST",
      body: JSON.stringify({ sessionId, signature }),
    });
    await refresh();
    return result;
  };

  const testPayment = async (url: string, method = "GET"): Promise<PayResult> => {
    // Non-browser adapters use the single-step flow
    if (adapterType !== "browser") {
      const result = await api<PayResult>("/api/pay", {
        method: "POST",
        body: JSON.stringify({ url, method }),
      });
      await refresh();
      return result;
    }

    // Browser wallet: two-phase flow with MetaMask signing
    if (!window.ethereum) {
      throw new Error("MetaMask is not available. Install the extension first.");
    }

    // Phase 1: Prepare
    const prepareResult = await preparePayment(url, method);
    if (prepareResult.error) {
      throw new Error(prepareResult.error);
    }

    // Verify MetaMask account matches wallet address
    const accounts = await window.ethereum.request({
      method: "eth_accounts",
    }) as string[];

    if (!accounts || accounts.length === 0) {
      throw new Error("No MetaMask account connected. Please connect MetaMask first.");
    }

    if (accounts[0].toLowerCase() !== prepareResult.message.from.toLowerCase()) {
      throw new Error(
        `MetaMask account (${accounts[0].slice(0, 8)}...) does not match wallet address (${prepareResult.message.from.slice(0, 8)}...). Switch accounts in MetaMask.`,
      );
    }

    // Phase 2: Sign with MetaMask
    let signature: string;
    try {
      signature = await window.ethereum.request({
        method: "eth_signTypedData_v4",
        params: [
          accounts[0],
          JSON.stringify({
            types: {
              EIP712Domain: [
                { name: "name", type: "string" },
                { name: "version", type: "string" },
                { name: "chainId", type: "uint256" },
                { name: "verifyingContract", type: "address" },
              ],
              ...prepareResult.types,
            },
            domain: prepareResult.domain,
            primaryType: prepareResult.primaryType,
            message: prepareResult.message,
          }),
        ],
      }) as string;
    } catch (err: unknown) {
      const code = (err as { code?: number }).code;
      if (code === 4001) {
        throw new Error("Signing rejected in MetaMask.");
      }
      throw new Error(
        err instanceof Error ? err.message : "MetaMask signing failed",
      );
    }

    // Phase 3: Complete
    return completePayment(prepareResult.sessionId, signature);
  };

  return {
    demoMode,
    loading,
    wallet,
    walletId,
    walletLabel,
    adapterType,
    wallets,
    balance,
    rules,
    transactions,
    todaySpent,
    network,
    agentIdentity,
    lastUpdated,
    refresh,
    freeze,
    unfreeze,
    saveRules,
    createWallet: createNewWallet,
    switchWallet: switchWalletFn,
    setNetwork: setNetworkFn,
    removeWallet: removeWalletFn,
    renameWallet: renameWalletFn,
    saveAgentIdentity,
    testPayment,
  };
}
