import { useState } from "react";
import type { WalletSummary, NetworkId } from "../types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Snowflake,
  Sun,
} from "lucide-react";
import WalletSelectorDialog from "./WalletSelectorDialog";

type ConfirmAction =
  | { type: "freeze" }
  | { type: "unfreeze" };

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
    }
    setConfirmAction(null);
  };

  const getConfirmProps = () => {
    if (!confirmAction) return { title: "", description: "", confirmLabel: "" };
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

          {/* Wallet selector dialog */}
          <WalletSelectorDialog
            walletId={walletId}
            walletLabel={walletLabel}
            wallets={wallets}
            hasWallet={hasWallet}
            currentNetwork={network}
            onSwitchWallet={onSwitchWallet}
            onRemoveWallet={onRemoveWallet}
            onAddWallet={onAddWallet}
          />

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
