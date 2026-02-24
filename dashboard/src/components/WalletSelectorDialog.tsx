import { useState, useMemo } from "react";
import type { WalletSummary } from "../types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowUpRight,
  Plus,
  X,
  Search,
  Lock,
  Globe,
} from "lucide-react";
import { ProviderIcon, getProviderMeta } from "@/lib/providers";

interface WalletSelectorDialogProps {
  walletId: string | null;
  walletLabel: string | null;
  wallets: WalletSummary[];
  hasWallet: boolean;
  currentNetwork: string;
  onSwitchWallet: (id: string) => void;
  onRemoveWallet: (id: string) => void;
  onAddWallet: () => void;
}

function getWalletNetwork(w: WalletSummary, currentNetwork: string): { label: string; isTestnet: boolean } {
  // Check explicit network field first (set by external providers)
  const net = w.network || w.tags?.network;
  if (net) {
    const isTest = net === "base-sepolia" || net.includes("testnet") || net.includes("sepolia");
    return { label: isTest ? "Testnet" : "Mainnet", isTestnet: isTest };
  }
  // Fall back to the dashboard's current network
  const isTest = currentNetwork === "base-sepolia";
  return { label: isTest ? "Testnet" : "Mainnet", isTestnet: isTest };
}

function truncateAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return addr.slice(0, 6) + "\u2026" + addr.slice(-4);
}

export default function WalletSelectorDialog({
  walletId,
  walletLabel,
  wallets,
  hasWallet,
  currentNetwork,
  onSwitchWallet,
  onRemoveWallet,
  onAddWallet,
}: WalletSelectorDialogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; label: string } | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return wallets;
    const q = search.toLowerCase();
    return wallets.filter(
      (w) =>
        w.label.toLowerCase().includes(q) ||
        w.address.toLowerCase().includes(q),
    );
  }, [wallets, search]);

  const handleSelect = (id: string) => {
    if (id === walletId) return;
    onSwitchWallet(id);
    setOpen(false);
    setSearch("");
  };

  const handleRemoveConfirm = () => {
    if (!confirmRemove) return;
    onRemoveWallet(confirmRemove.id);
    setConfirmRemove(null);
  };

  const handleAddWallet = () => {
    setOpen(false);
    setSearch("");
    onAddWallet();
  };

  return (
    <>
      {/* Trigger button */}
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <span className="max-w-[120px] truncate">
          {walletLabel || (hasWallet ? "Wallet" : "No Wallet")}
        </span>
        <ArrowUpRight className="h-3 w-3 opacity-50" />
      </Button>

      {/* Main selector dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
        <DialogContent className="sm:max-w-[420px] p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-0">
            <DialogTitle className="text-base">
              Wallets
              <span className="ml-2 text-xs font-normal text-[#888888]">
                {wallets.length}
              </span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Select a wallet to use
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          {wallets.length > 3 && (
            <div className="px-5 pt-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#888888]" />
                <input
                  type="text"
                  placeholder="Search wallets…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 text-sm bg-[#F2F2F2] rounded-[10px] border-0 outline-none focus:border-[1.5px] focus:border-[#D0D0D0] placeholder:text-[#888888]"
                />
              </div>
            </div>
          )}

          {/* Wallet list */}
          <div className="px-2 py-2 max-h-[360px] overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-sm text-[#888888] text-center">
                No wallets found
              </p>
            )}
            {filtered.map((w) => {
              const isCurrent = w.id === walletId;
              const meta = getProviderMeta(w.adapter);
              const walletNet = getWalletNetwork(w, currentNetwork);
              return (
                <button
                  key={w.id}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[10px] text-left transition-colors duration-150 ${
                    isCurrent
                      ? "bg-[#F2F2F2]"
                      : "hover:bg-[#F2F2F2]"
                  }`}
                  onClick={() => handleSelect(w.id)}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E8E8E8] overflow-hidden">
                      <ProviderIcon adapter={w.adapter} size={16} />
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-medium truncate flex items-center gap-1.5">
                        {w.label}
                        {isCurrent && (
                          <span className="text-[11px] font-normal text-[#888888]">(current)</span>
                        )}
                      </span>
                      <span className="font-mono text-xs text-[#888888] truncate flex items-center gap-1">
                        {meta.name} · {truncateAddr(w.address)}
                        <span className="inline-flex items-center gap-0.5 ml-1">
                          <Globe className="h-2.5 w-2.5" />
                          {walletNet.label}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {w.frozen && (
                      <Badge className="gap-1">
                        <Lock className="h-2.5 w-2.5" />
                        Frozen
                      </Badge>
                    )}
                    {wallets.length > 1 && (
                      <button
                        className="rounded-full p-1 text-[#888888] hover:bg-[#EBEBEB] hover:text-[#111111] transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmRemove({ id: w.id, label: w.label });
                        }}
                        title="Remove wallet"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Add wallet */}
          <div className="border-t border-[#E8E8E8] px-2 py-2">
            <button
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-sm text-[#111111] hover:bg-[#F2F2F2] transition-colors duration-150"
              onClick={handleAddWallet}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Wallet
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation dialog */}
      <Dialog open={!!confirmRemove} onOpenChange={(v) => !v && setConfirmRemove(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Remove Wallet</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove "{confirmRemove?.label}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmRemove(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleRemoveConfirm}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
