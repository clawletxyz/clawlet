import { useState, useCallback } from "react";
import { useClawlet } from "./hooks/useClawlet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import Header from "./components/Header";
import Cards from "./components/Cards";
import AgentIdentity from "./components/AgentIdentity";
import SpendingRules from "./components/SpendingRules";
import Transactions from "./components/Transactions";
import NoWallet from "./components/NoWallet";
import GettingStarted from "./components/GettingStarted";
import FundWallet from "./components/FundWallet";
import SpendingBreakdown from "./components/SpendingBreakdown";
import QuickPayment from "./components/QuickPayment";
import McpSetup from "./components/McpSetup";
import ApiKeyPrompt from "./components/ApiKeyPrompt";
import TabBar, { type TabId } from "./components/TabBar";

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export default function App() {
  const {
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
    createWallet,
    switchWallet,
    setNetwork,
    removeWallet,
    saveAgentIdentity,
    testPayment,
  } = useClawlet();

  const [showAddWallet, setShowAddWallet] = useState(false);

  const getInitialTab = (): TabId => {
    const hash = window.location.hash.replace("#", "") as TabId;
    if (["overview", "rules", "transactions", "settings"].includes(hash)) return hash;
    return "overview";
  };
  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab);

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    history.replaceState(null, "", `#${tab}`);
  }, []);

  const showToast = useCallback(
    (message: string, type: "success" | "error" | "info" = "success") => {
      if (type === "error") toast.error(message);
      else if (type === "info") toast.info(message);
      else toast.success(message);
    },
    [],
  );

  const scrollTo = useCallback((id: string) => {
    const tabMap: Record<string, TabId> = {
      "spending-rules": "rules",
      "agent-identity": "settings",
      "fund-wallet": "settings",
      "quick-payment": "settings",
    };
    const targetTab = tabMap[id];
    if (targetTab) {
      setActiveTab(targetTab);
      history.replaceState(null, "", `#${targetTab}`);
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const handleFreeze = async () => {
    try {
      await freeze();
      toast.success("Wallet frozen");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to freeze");
    }
  };

  const handleUnfreeze = async () => {
    try {
      await unfreeze();
      toast.success("Wallet unfrozen");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to unfreeze");
    }
  };

  const handleSwitchWallet = async (id: string) => {
    try {
      await switchWallet(id);
      toast.success("Wallet switched");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to switch wallet");
    }
  };

  const handleSetNetwork = async (net: "base" | "base-sepolia") => {
    try {
      await setNetwork(net);
      toast.success(`Switched to ${net === "base" ? "Mainnet" : "Sepolia"}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to switch network");
    }
  };

  const handleRemoveWallet = async (id: string) => {
    try {
      await removeWallet(id);
      toast.success("Wallet removed");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove wallet");
    }
  };

  const handleCreateWallet = async (
    adapter: string,
    credentials?: Record<string, string>,
    label?: string,
  ) => {
    await createWallet(adapter, credentials, label);
  };

  const isFrozen = wallet?.frozen ?? false;
  const isTestnet = network === "base-sepolia";

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-white">
        {needsAuth && <ApiKeyPrompt onSubmit={setApiKey} onRetry={refresh} />}

        {/* Testnet banner — full-width solid bar at the very top */}
        {isTestnet && wallet && (
          <div className="w-full bg-[#F59E0B] px-4 py-2">
            <div className="mx-auto max-w-[1280px] flex items-center justify-center gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] border-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
              </span>
              <p className="text-sm font-medium text-white">
                Testnet Mode — Base Sepolia
              </p>
              <span className="text-xs text-white/80">
                · Transactions use testnet USDC
              </span>
            </div>
          </div>
        )}

        <div className="mx-auto max-w-[1280px] px-12 py-8 max-[768px]:px-6">
          <Header
            hasWallet={!!wallet}
            frozen={isFrozen}
            walletId={walletId}
            walletLabel={walletLabel}
            wallets={wallets}
            network={network}
            onFreeze={handleFreeze}
            onUnfreeze={handleUnfreeze}
            onSwitchWallet={handleSwitchWallet}
            onSetNetwork={handleSetNetwork}
            onRemoveWallet={handleRemoveWallet}
            onAddWallet={() => setShowAddWallet(true)}
          />

          {/* Last Updated Indicator */}
          {lastUpdated && (
            <div className="flex justify-end mb-4">
              <button
                onClick={refresh}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Click to refresh"
              >
                Updated {timeAgo(lastUpdated)}
              </button>
            </div>
          )}

          {demoMode && (
            <div className="mb-6 flex items-center justify-between rounded-[10px] bg-[#F2F2F2] px-4 py-3">
              <div className="flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="8" cy="8" r="6.25" stroke="#888888" strokeWidth="1.5"/>
                  <path d="M8 5v3" stroke="#888888" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="8" cy="11" r="0.75" fill="#888888"/>
                </svg>
                <p className="text-sm text-[#111111]">
                  <span className="font-medium">Live demo</span>
                  <span className="text-[#888888]"> — changes are disabled. </span>
                  <a
                    href="https://github.com/clawletxyz/clawlet"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#111111] underline hover:no-underline"
                  >
                    Clone the repo
                  </a>
                  <span className="text-[#888888]"> to run your own instance.</span>
                </p>
              </div>
            </div>
          )}

          {isFrozen && (
            <div className="mb-6 flex items-center gap-2 rounded-[10px] bg-[#F2F2F2] px-4 py-3 text-sm font-medium text-[#111111]">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              This wallet is frozen. Transactions are disabled until you unfreeze it.
            </div>
          )}

          <Dialog open={showAddWallet} onOpenChange={(open) => !open && setShowAddWallet(false)}>
            <DialogContent className="sm:max-w-[480px] p-0 gap-0">
              <NoWallet
                onCreate={handleCreateWallet}
                showToast={showToast}
                inline
                onCancel={() => setShowAddWallet(false)}
              />
            </DialogContent>
          </Dialog>

          <div className={isFrozen ? "opacity-60 transition-opacity hover:opacity-80" : ""}>
            {loading ? (
              <>
                <TabBar activeTab={activeTab} onChange={handleTabChange} />
                <Cards
                  loading
                  wallet={null}
                  walletLabel={null}
                  adapterType={null}
                  balance="--"
                  todaySpent="0.0"
                  rules={null}
                  network={network}
                />
              </>
            ) : !wallet && !showAddWallet ? (
              <NoWallet onCreate={handleCreateWallet} showToast={showToast}  />
            ) : wallet ? (
              <>
                <GettingStarted
                  wallet={wallet}
                  balance={balance}
                  agentIdentity={agentIdentity}
                  rules={rules}
                  transactions={transactions}
                  onScrollTo={scrollTo}
                />

                <TabBar activeTab={activeTab} onChange={handleTabChange} />

                {activeTab === "overview" && (
                  <>
                    <Cards
                      wallet={wallet}
                      walletLabel={walletLabel}
                      adapterType={adapterType}
                      balance={balance}
                      todaySpent={todaySpent}
                      rules={rules}
                      network={network}
                    />
                    <SpendingBreakdown
                      transactions={transactions}
                      rules={rules}
                      todaySpent={todaySpent}
                    />
                  </>
                )}

                {activeTab === "rules" && (
                  <div id="spending-rules">
                    <SpendingRules
                      rules={rules}
                      onSave={saveRules}
                      showToast={showToast}
                    />
                  </div>
                )}

                {activeTab === "transactions" && (
                  <Transactions transactions={transactions} onRefresh={refresh} />
                )}

                {activeTab === "settings" && (
                  <>
                    <div id="agent-identity">
                      <AgentIdentity
                        identity={agentIdentity}
                        walletAddress={wallet.address}
                        network={network}
                        onSave={saveAgentIdentity}
                        showToast={showToast}
                      />
                    </div>
                    <div id="fund-wallet">
                      <FundWallet
                        wallet={wallet}
                        network={network}
                        balance={balance}
                      />
                    </div>
                    <div id="quick-payment">
                      <QuickPayment
                        onPay={testPayment}
                        frozen={isFrozen}
                        network={network}
                        canSignServerSide={canSignServerSide}
                        showToast={showToast}
                      />
                    </div>
                    <McpSetup />
                  </>
                )}
              </>
            ) : null}
          </div>
        </div>
        <Toaster position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}
