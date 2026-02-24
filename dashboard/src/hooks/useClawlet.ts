import { useState, useEffect, useCallback, useRef } from "react";
import { api, UnauthorizedError } from "../api";
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

const STORAGE_KEY = "clawlet_active_wallet_id";

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
  const [canSignServerSide, setCanSignServerSide] = useState(true);
  const [wallets, setWallets] = useState<WalletSummary[]>([]);
  const [balance, setBalance] = useState("—");
  const [rules, setRules] = useState<SpendingRules | null>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [todaySpent, setTodaySpent] = useState("0.0");
  const [network, setNetworkState] = useState<NetworkId>("base");
  const [agentIdentity, setAgentIdentityState] = useState<AgentIdentity | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const refreshCount = useRef(0);

  // Fetch config (demo mode + auth) on mount
  useEffect(() => {
    api<{ demoMode: boolean; authRequired?: boolean }>("/api/config")
      .then((cfg) => {
        setDemoMode(cfg.demoMode);
        // If auth is required but no key stored, flag it
        if (cfg.authRequired && !localStorage.getItem("clawlet_api_key")) {
          setNeedsAuth(true);
        }
      })
      .catch(() => {});
  }, []);

  const setApiKey = useCallback((key: string) => {
    localStorage.setItem("clawlet_api_key", key);
    setNeedsAuth(false);
  }, []);

  const refresh = useCallback(async () => {
    // Stage 1: Fetch wallet list + global data
    const [walletsResult, networkResult, configResult] = await Promise.allSettled([
      api<{ wallets: WalletSummary[] }>("/api/wallets"),
      api<{ network: NetworkId }>("/api/network"),
      api<{ demoMode: boolean; authRequired?: boolean }>("/api/config"),
    ]);

    // Check for 401
    const has401 = [walletsResult, networkResult, configResult].some(
      (r) => r.status === "rejected" && r.reason instanceof UnauthorizedError,
    );
    if (has401) {
      setNeedsAuth(true);
      setLoading(false);
      return;
    }

    let walletList: WalletSummary[] = [];
    if (walletsResult.status === "fulfilled") {
      walletList = walletsResult.value.wallets;
      setWallets(walletList);
    }
    if (networkResult.status === "fulfilled") {
      setNetworkState(networkResult.value.network);
    }

    // Stage 2: Resolve active wallet ID
    let activeId: string | null = null;
    if (walletList.length > 0) {
      const storedId = localStorage.getItem(STORAGE_KEY);
      const found = storedId && walletList.some((w) => w.id === storedId);
      activeId = found ? storedId : walletList[0].id;

      // Persist resolved ID
      if (activeId !== storedId) {
        localStorage.setItem(STORAGE_KEY, activeId);
      }
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }

    setWalletId(activeId);

    // If no wallets, clear everything
    if (!activeId) {
      setWallet(null);
      setWalletLabel(null);
      setAdapterType(null);
      setBalance("—");
      setRules(null);
      setTransactions([]);
      setTodaySpent("0.0");
      setAgentIdentityState(null);
      setLastUpdated(new Date());
      refreshCount.current += 1;
      setLoading(false);
      return;
    }

    // Set wallet metadata from the list
    const activeWallet = walletList.find((w) => w.id === activeId)!;
    setWalletLabel(activeWallet.label);
    setAdapterType(activeWallet.adapter);
    setCanSignServerSide(activeWallet.canSignServerSide ?? activeWallet.adapter !== "browser");
    setWallet({
      address: activeWallet.address,
      createdAt: activeWallet.createdAt,
      frozen: activeWallet.frozen,
    });

    // Stage 3: Fetch wallet-scoped data
    const [balanceResult, rulesResult, txResult, spentResult, identityResult] = await Promise.allSettled([
      api<{ balance: string }>(`/api/wallets/${activeId}/balance`),
      api<SpendingRules>(`/api/wallets/${activeId}/rules`),
      api<{ transactions: TransactionRecord[] }>(`/api/wallets/${activeId}/transactions?limit=50`),
      api<{ spent: string }>(`/api/wallets/${activeId}/today-spent`),
      api<{ identity: AgentIdentity | null }>(`/api/wallets/${activeId}/agent-identity`),
    ]);

    if (balanceResult.status === "fulfilled") {
      setBalance(balanceResult.value.balance);
    }
    if (rulesResult.status === "fulfilled") {
      setRules(rulesResult.value);
    }
    if (txResult.status === "fulfilled") {
      setTransactions(txResult.value.transactions || []);
    }
    if (spentResult.status === "fulfilled") {
      setTodaySpent(spentResult.value.spent);
    }
    if (identityResult.status === "fulfilled") {
      setAgentIdentityState(identityResult.value.identity);
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
    if (!walletId) return;
    await api(`/api/wallets/${walletId}/freeze`, { method: "POST" });
    setWallet((prev) => (prev ? { ...prev, frozen: true } : null));
  };

  const unfreeze = async () => {
    if (!walletId) return;
    await api(`/api/wallets/${walletId}/unfreeze`, { method: "POST" });
    setWallet((prev) => (prev ? { ...prev, frozen: false } : null));
  };

  const saveRules = async (newRules: SpendingRules) => {
    if (!walletId) return;
    const updated = await api<SpendingRules>(`/api/wallets/${walletId}/rules`, {
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
    const result = await api<{ id: string }>("/api/wallets", {
      method: "POST",
      body: JSON.stringify({ adapter, credentials, label }),
    });
    // Make the new wallet active
    localStorage.setItem(STORAGE_KEY, result.id);
    await refresh();
  };

  const switchWalletFn = async (targetWalletId: string) => {
    // Pure client-side switch — no server call
    setWalletId(targetWalletId);
    localStorage.setItem(STORAGE_KEY, targetWalletId);
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
    // If removed was active, clear localStorage so refresh picks the first wallet
    if (targetWalletId === walletId) {
      localStorage.removeItem(STORAGE_KEY);
    }
    await refresh();
  };

  const renameWalletFn = async (label: string) => {
    if (!walletId) return;
    await api(`/api/wallets/${walletId}/rename`, {
      method: "POST",
      body: JSON.stringify({ label }),
    });
    await refresh();
  };

  const saveAgentIdentity = async (identity: Partial<AgentIdentity>) => {
    if (!walletId) return;
    const result = await api<{ identity: AgentIdentity }>(`/api/wallets/${walletId}/agent-identity`, {
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
    if (!walletId) throw new Error("No wallet selected");
    return api<PrepareResult>(`/api/wallets/${walletId}/pay/prepare`, {
      method: "POST",
      body: JSON.stringify({ url, method }),
    });
  };

  const completePayment = async (sessionId: string, signature: string): Promise<PayResult> => {
    if (!walletId) throw new Error("No wallet selected");
    const result = await api<PayResult>(`/api/wallets/${walletId}/pay/complete`, {
      method: "POST",
      body: JSON.stringify({ sessionId, signature }),
    });
    await refresh();
    return result;
  };

  const testPayment = async (url: string, method = "GET"): Promise<PayResult> => {
    if (!walletId) throw new Error("No wallet selected");

    // Server-side signers use the single-step flow
    if (canSignServerSide) {
      const result = await api<PayResult>(`/api/wallets/${walletId}/pay`, {
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
    needsAuth,
    setApiKey,
    loading,
    wallet,
    walletId,
    walletLabel,
    adapterType,
    canSignServerSide,
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
