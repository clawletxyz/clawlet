import { useState } from "react";
import type { WalletSummary, NetworkId } from "../types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronDown,
  Plus,
  X,
  Snowflake,
  Sun,
} from "lucide-react";
import { ProviderIcon } from "@/lib/providers";

type ConfirmAction =
  | { type: "freeze" }
  | { type: "unfreeze" }
  | { type: "remove"; walletId: string; walletLabel: string };

interface HeaderProps {
  hasWallet: boolean;
  frozen: boolean;
  walletId: string | null;
  walletLabel: string | null;
  wallets: WalletSummary[];
  network: NetworkId;
  onFreeze: () => void;
  onUnfreeze: () => void;
  onSwitchWallet: (id: string) => void;
  onSetNetwork: (net: NetworkId) => void;
  onRemoveWallet: (id: string) => void;
  onAddWallet: () => void;
}

function truncateAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return addr.slice(0, 6) + "\u2026" + addr.slice(-4);
}

export default function Header({
  hasWallet,
  frozen,
  walletId,
  walletLabel,
  wallets,
  network,
  onFreeze,
  onUnfreeze,
  onSwitchWallet,
  onSetNetwork,
  onRemoveWallet,
  onAddWallet,
}: HeaderProps) {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const handleConfirm = () => {
    if (!confirmAction) return;
    switch (confirmAction.type) {
      case "freeze": onFreeze(); break;
      case "unfreeze": onUnfreeze(); break;
      case "remove": onRemoveWallet(confirmAction.walletId); break;
    }
    setConfirmAction(null);
  };

  const getConfirmProps = () => {
    if (!confirmAction) return { title: "", description: "" };
    switch (confirmAction.type) {
      case "freeze":
        return {
          title: "Freeze Wallet",
          description: "This will disable all transactions for this wallet. The wallet can be unfrozen later.",
          confirmLabel: "Freeze",
        };
      case "unfreeze":
        return {
          title: "Unfreeze Wallet",
          description: "This will re-enable transactions for this wallet.",
          confirmLabel: "Unfreeze",
        };
      case "remove":
        return {
          title: "Remove Wallet",
          description: `Are you sure you want to remove "${confirmAction.walletLabel}"? This action cannot be undone.`,
          confirmLabel: "Remove",
        };
    }
  };

  const confirmProps = getConfirmProps();

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between bg-white mb-8">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="clawlet" className="size-12" />
        </div>

        <div className="flex items-center gap-2">
          {/* Network toggle — segmented pill */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-[#EBEBEB] p-[3px]">
              <button
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-150 rounded-full ${
                  network === "base"
                    ? "bg-white font-semibold text-[#111111]"
                    : "text-[#888888] hover:text-[#111111]"
                }`}
                onClick={() => onSetNetwork("base")}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#111111] shrink-0" />
                Mainnet
              </button>
              <button
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-150 rounded-full ${
                  network === "base-sepolia"
                    ? "bg-white font-semibold text-[#111111]"
                    : "text-[#888888] hover:text-[#111111]"
                }`}
                onClick={() => onSetNetwork("base-sepolia")}
              >
                <span className="h-1.5 w-1.5 rounded-full border border-[#888888] shrink-0" />
                Testnet
              </button>
            </div>
          </div>

          {/* Wallet switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <span className="max-w-[120px] truncate">
                  {walletLabel || (hasWallet ? "Wallet" : "No Wallet")}
                </span>
                <ChevronDown className="h-3.5 w-3.5 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[280px]">
              {wallets.map((w) => (
                <DropdownMenuItem
                  key={w.id}
                  className="flex items-center justify-between gap-3 py-2.5 cursor-pointer"
                  onClick={() => onSwitchWallet(w.id)}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F2F2F2] overflow-hidden">
                      <ProviderIcon adapter={w.adapter} size={16} />
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-medium truncate">
                        {w.label}
                        {w.id === walletId && (
                          <span className="ml-1.5 text-xs text-muted-foreground">(current)</span>
                        )}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {truncateAddr(w.address)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge>
                      {w.frozen ? "Frozen" : "Active"}
                    </Badge>
                    {wallets.length > 1 && w.id !== walletId && (
                      <button
                        className="rounded-full p-1 text-muted-foreground hover:bg-[#F2F2F2] hover:text-foreground transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmAction({ type: "remove", walletId: w.id, walletLabel: w.label });
                        }}
                        title="Remove wallet"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={onAddWallet}>
                <Plus className="h-3.5 w-3.5" />
                Add Wallet
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Freeze/Unfreeze */}
          {hasWallet && (
            frozen ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setConfirmAction({ type: "unfreeze" })}
              >
                <Sun className="h-3.5 w-3.5" />
                Unfreeze
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setConfirmAction({ type: "freeze" })}
              >
                <Snowflake className="h-3.5 w-3.5" />
                Freeze
              </Button>
            )
          )}
        </div>
      </header>

      {/* Confirm Dialog */}
      <Dialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{confirmProps.title}</DialogTitle>
            <DialogDescription>{confirmProps.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
            >
              {confirmProps.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
