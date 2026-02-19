import { useState, useEffect } from "react";
import type { WalletInfo, SpendingRules, AgentIdentity, TransactionRecord } from "../types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, X, Wallet, UserCircle, Shield, Zap } from "lucide-react";

interface GettingStartedProps {
  wallet: WalletInfo | null;
  balance: string;
  agentIdentity: AgentIdentity | null;
  rules: SpendingRules | null;
  transactions: TransactionRecord[];
  onScrollTo: (id: string) => void;
}

interface Step {
  key: string;
  label: string;
  description: string;
  done: boolean;
  action?: { label: string; target: string };
  icon: React.ReactNode;
}

export default function GettingStarted({
  wallet,
  balance,
  agentIdentity,
  rules,
  transactions,
  onScrollTo,
}: GettingStartedProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("clawlet-gs-dismissed");
    if (saved === "true") setDismissed(true);
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("clawlet-gs-dismissed", "true");
  };

  const balanceNum = parseFloat(balance) || 0;
  const hasRules =
    rules &&
    (rules.maxPerTransaction ||
      rules.dailyCap ||
      (rules.allowedServices && rules.allowedServices.length > 0) ||
      (rules.blockedServices && rules.blockedServices.length > 0));
  const hasSettledTx = transactions.some((t) => t.status === "settled");

  const steps: Step[] = [
    {
      key: "wallet",
      label: "Create a wallet",
      description: "Set up your first agent wallet to get started.",
      done: !!wallet,
      icon: <Wallet className="h-4 w-4" />,
    },
    {
      key: "fund",
      label: "Fund your wallet",
      description: "Deposit USDC to enable x402 payments.",
      done: balanceNum > 0,
      action: wallet && balanceNum === 0 ? { label: "Fund Wallet", target: "fund-wallet" } : undefined,
      icon: <img src="/providers/usdcoin.png" alt="USDC" className="h-4 w-4" />,
    },
    {
      key: "identity",
      label: "Set agent identity",
      description: "Attach an ERC-8004 identity to your payments.",
      done: !!agentIdentity,
      action: wallet && !agentIdentity ? { label: "Set Identity", target: "agent-identity" } : undefined,
      icon: <UserCircle className="h-4 w-4" />,
    },
    {
      key: "rules",
      label: "Configure spending rules",
      description: "Set transaction limits and service allowlists.",
      done: !!hasRules,
      action: wallet && !hasRules ? { label: "Set Rules", target: "spending-rules" } : undefined,
      icon: <Shield className="h-4 w-4" />,
    },
    {
      key: "payment",
      label: "Make your first payment",
      description: "Send a test x402 payment to verify everything works.",
      done: hasSettledTx,
      action: wallet && !hasSettledTx ? { label: "Try Payment", target: "quick-payment" } : undefined,
      icon: <Zap className="h-4 w-4" />,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  if (dismissed || allDone) return null;

  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E8E8E8]">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Getting Started</h3>
          <span className="font-mono text-xs text-muted-foreground">
            {doneCount}/{steps.length} complete
          </span>
        </div>
        <button
          onClick={handleDismiss}
          className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-[#E8E8E8] transition-colors"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-5">
        <div className="mb-4 space-y-1.5">
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-muted-foreground text-right font-mono">{pct}%</p>
        </div>

        <div className="space-y-3">
          {steps.map((step) => (
            <div
              key={step.key}
              className={`flex items-start gap-3 rounded-[10px] p-3 transition-colors ${
                step.done
                  ? "bg-[#E8E8E8]"
                  : "bg-white"
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {step.done ? (
                  <CheckCircle2 className="h-5 w-5 text-[#111111]" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{step.icon}</span>
                  <p className={`text-sm font-medium ${step.done ? "line-through text-muted-foreground" : ""}`}>
                    {step.label}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
              </div>
              {!step.done && step.action && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => onScrollTo(step.action!.target)}
                >
                  {step.action.label}
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
