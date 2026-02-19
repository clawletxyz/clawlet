import type { WalletInfo, SpendingRules, NetworkId } from "../types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Wallet, ArrowDownUp } from "lucide-react";
import { getProviderMeta, ProviderIcon } from "@/lib/providers";
import CopyButton from "./CopyButton";
import Skeleton from "./Skeleton";

function truncate(str: string | null, len = 8): string {
  if (!str || str.length <= len * 2 + 2) return str || "--";
  return str.slice(0, len) + "\u2026" + str.slice(-len);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface CardsProps {
  wallet: WalletInfo | null;
  walletLabel: string | null;
  adapterType: string | null;
  balance: string;
  todaySpent: string;
  rules: SpendingRules | null;
  network: NetworkId;
  loading?: boolean;
}

export default function Cards({
  wallet,
  walletLabel,
  adapterType,
  balance,
  todaySpent,
  rules,
  network,
  loading,
}: CardsProps) {
  const isTestnet = network === "base-sepolia";
  const networkLabel = isTestnet ? "Base Sepolia (Testnet)" : "Base Mainnet";
  const spentNum = parseFloat(todaySpent) || 0;
  const capNum = rules?.dailyCap ? parseFloat(rules.dailyCap) : 0;
  const spentPct = capNum > 0 ? Math.min(100, (spentNum / capNum) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-3 lg:grid-cols-1">
      {/* Wallet Card */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#E8E8E8]">
            <Wallet className="h-3.5 w-3.5 text-[#111111]" />
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {walletLabel || "Wallet"}
          </span>
        </div>
        <div className="font-mono text-sm font-medium">
          {loading ? (
            <Skeleton width="180px" height="14px" />
          ) : wallet ? (
            <CopyButton text={wallet.address} displayText={truncate(wallet.address)} />
          ) : (
            "--"
          )}
        </div>
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          {loading ? (
            <Skeleton width="80px" height="20px" />
          ) : wallet ? (
            <>
              <Badge>
                {wallet.frozen ? "Frozen" : "Active"}
              </Badge>
              {adapterType && (
                <Badge className="inline-flex items-center gap-1">
                  <ProviderIcon adapter={adapterType} size={12} />
                  {getProviderMeta(adapterType).name}
                </Badge>
              )}
              <span className="text-[11px] text-muted-foreground">
                Created {formatDate(wallet.createdAt)}
              </span>
            </>
          ) : null}
        </div>
      </Card>

      {/* Balance Card */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#E8E8E8]">
            <img src="/providers/usdcoin.png" alt="USDC" className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Balance
          </span>
        </div>
        <div className="font-mono text-2xl font-bold tracking-tight">
          {loading ? <Skeleton width="100px" height="28px" /> : balance}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isTestnet ? "border border-[#888888]" : "bg-[#111111]"}`} />
          {isTestnet ? "Testnet USDC" : "USDC"} on {networkLabel}
        </p>
      </Card>

      {/* Spent Today Card */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#E8E8E8]">
            <ArrowDownUp className="h-3.5 w-3.5 text-[#111111]" />
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Spent Today
          </span>
        </div>
        <div className="font-mono text-2xl font-bold tracking-tight">
          {loading ? <Skeleton width="80px" height="28px" /> : todaySpent}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          USDC{rules?.dailyCap ? ` / ${rules.dailyCap} cap` : ""}
        </p>
        {!loading && capNum > 0 && (
          <div className="mt-3 space-y-1">
            <Progress value={spentPct} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground text-right font-mono">
              {spentPct.toFixed(0)}% used
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
