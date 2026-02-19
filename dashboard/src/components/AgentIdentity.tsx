import { useState, useEffect, useCallback } from "react";
import type { AgentIdentity as AgentIdentityType } from "../types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  UserCircle,
  ExternalLink,
  Pencil,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  User,
  Link2,
} from "lucide-react";
import Skeleton from "./Skeleton";
import { explorerAddressUrl, explorerName, explorerIcon } from "@/lib/explorer";

type Step = 1 | 2 | 3;
type SaveStatus = "idle" | "saving" | "success" | "error";

interface AgentIdentityProps {
  identity: AgentIdentityType | null;
  walletAddress: string;
  network?: string;
  onSave: (identity: Partial<AgentIdentityType>) => Promise<void>;
  showToast: (msg: string, type?: "success" | "error") => void;
  loading?: boolean;
}

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center justify-center gap-2 pt-6 pb-2">
      {[1, 2, 3].map((s) => (
        <div
          key={s}
          className={`h-[6px] w-8 rounded-full transition-colors duration-200 ${
            s === current ? "bg-[#2563EB]" : "bg-[#E8E8E8]"
          }`}
        />
      ))}
    </div>
  );
}

function IdentityWizard({
  identity,
  onSave,
  onClose,
}: {
  identity: AgentIdentityType | null;
  onSave: (identity: Partial<AgentIdentityType>) => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agentId, setAgentId] = useState("");
  const [agentRegistry, setAgentRegistry] = useState("");
  const [agentURI, setAgentURI] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  useEffect(() => {
    if (identity) {
      setName(identity.name || "");
      setDescription(identity.description || "");
      setAgentId(identity.agentId || "");
      setAgentRegistry(identity.agentRegistry || "");
      setAgentURI(identity.agentURI || "");
    }
  }, [identity]);

  // Auto-dismiss on success
  useEffect(() => {
    if (saveStatus === "success") {
      const timer = setTimeout(() => onClose(), 1500);
      return () => clearTimeout(timer);
    }
  }, [saveStatus, onClose]);

  const goToStep = (target: Step, dir: "forward" | "back" = "forward") => {
    setDirection(dir);
    setStep(target);
  };

  const isStep1Valid = name.trim().length > 0;

  const handleSave = async () => {
    goToStep(3, "forward");
    setSaveStatus("saving");
    setErrorMessage("");
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        agentId: agentId.trim() || undefined,
        agentRegistry: agentRegistry.trim() || undefined,
        agentURI: agentURI.trim() || undefined,
      });
      setSaveStatus("success");
    } catch (e: unknown) {
      setSaveStatus("error");
      setErrorMessage(e instanceof Error ? e.message : "Failed to save identity");
    }
  };

  const handleRetry = () => {
    goToStep(2, "back");
    setSaveStatus("idle");
    setErrorMessage("");
  };

  const translateClass =
    direction === "forward"
      ? "animate-[slideInRight_200ms_ease-out]"
      : "animate-[slideInLeft_200ms_ease-out]";

  return (
    <div className="overflow-hidden">
      {step === 1 && (
        <div key="step1" className={translateClass}>
          <div className="px-5 py-3.5 border-b border-[#E8E8E8]">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-[#888888]" />
              <div>
                <h3 className="text-sm font-semibold">Basic Info</h3>
                <p className="text-xs text-[#888888] mt-0.5">Set your agent's name and description.</p>
              </div>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#888888]">Agent Name *</Label>
              <Input
                placeholder="e.g. ResearchBot"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#888888]">Description</Label>
              <Input
                placeholder="What this agent does"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <Button
              className="w-full gap-1.5"
              onClick={() => goToStep(2, "forward")}
              disabled={!isStep1Valid}
            >
              Next
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <StepIndicator current={1} />
        </div>
      )}

      {step === 2 && (
        <div key="step2" className={translateClass}>
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[#E8E8E8]">
            <button
              onClick={() => goToStep(1, "back")}
              className="p-1 rounded-full hover:bg-[#F2F2F2] transition-colors duration-150"
            >
              <ArrowLeft className="h-4 w-4 text-[#111111]" />
            </button>
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-[#888888]" />
              <div>
                <h3 className="text-sm font-semibold">On-chain Identity</h3>
                <p className="text-xs text-[#888888] mt-0.5">Optional ERC-8004 registration details.</p>
              </div>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#888888]">ERC-8004 Agent ID</Label>
              <Input
                placeholder="Token ID (if registered on-chain)"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#888888]">Agent Registry</Label>
              <Input
                placeholder="eip155:8453:0x8004A169..."
                value={agentRegistry}
                onChange={(e) => setAgentRegistry(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#888888]">Agent URI (metadata)</Label>
              <Input
                placeholder="ipfs://... or https://..."
                value={agentURI}
                onChange={(e) => setAgentURI(e.target.value)}
                className="font-mono"
              />
            </div>
            <Button className="w-full" onClick={handleSave}>
              Save Identity
            </Button>
          </div>
          <StepIndicator current={2} />
        </div>
      )}

      {step === 3 && (
        <div key="step3" className={translateClass}>
          <div className="px-5 py-3.5 border-b border-[#E8E8E8]">
            <h3 className="text-sm font-semibold">
              {saveStatus === "success" ? "Done" : saveStatus === "error" ? "Error" : "Saving"}
            </h3>
          </div>
          <div className="p-5 flex flex-col items-center justify-center min-h-[200px] text-center">
            {saveStatus === "saving" && (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F2F2F2] mb-4">
                  <Loader2 className="h-6 w-6 text-[#111111] animate-spin" />
                </div>
                <p className="text-sm font-medium text-[#111111]">Saving identity...</p>
              </>
            )}
            {saveStatus === "success" && (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F2F2F2] mb-4">
                  <CheckCircle2 className="h-6 w-6 text-[#111111]" />
                </div>
                <p className="text-sm font-medium text-[#111111]">Identity saved</p>
                <p className="text-xs text-[#888888] mt-1">Your agent identity is now active.</p>
              </>
            )}
            {saveStatus === "error" && (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F2F2F2] mb-4">
                  <AlertCircle className="h-6 w-6 text-[#111111]" />
                </div>
                <p className="text-sm font-medium text-[#111111]">Something went wrong</p>
                <p className="text-xs text-[#888888] mt-1 max-w-[280px]">{errorMessage}</p>
                <Button variant="outline" className="mt-4" onClick={handleRetry}>
                  Try Again
                </Button>
              </>
            )}
          </div>
          <StepIndicator current={3} />
        </div>
      )}
    </div>
  );
}

export default function AgentIdentity({
  identity,
  walletAddress,
  network,
  onSave,
  showToast,
  loading,
}: AgentIdentityProps) {
  const [open, setOpen] = useState(false);

  const handleSave = useCallback(
    async (data: Partial<AgentIdentityType>) => {
      await onSave(data);
      showToast("Agent identity saved");
    },
    [onSave, showToast],
  );

  const addressUrl = explorerAddressUrl(walletAddress, network);

  if (loading) {
    return (
      <Card className="mb-6">
        <div className="px-5 py-3.5 border-b border-[#E8E8E8]">
          <h3 className="text-sm font-semibold">Agent Identity</h3>
        </div>
        <div className="p-5">
          <div className="flex items-start gap-4">
            <Skeleton width="44px" height="44px" borderRadius="9999px" />
            <div className="space-y-2">
              <Skeleton width="140px" height="18px" />
              <Skeleton width="200px" height="14px" />
              <Skeleton width="120px" height="20px" />
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="mb-6">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E8E8E8]">
          <h3 className="text-sm font-semibold">Agent Identity</h3>
          <div className="flex gap-2">
            {identity && (
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <a href={addressUrl} target="_blank" rel="noopener noreferrer">
                  {explorerIcon(network) ? (
                    <img src={explorerIcon(network)!} alt="" className="h-3.5 w-3.5" />
                  ) : null}
                  {explorerName(network)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setOpen(true)}
              className={identity ? "gap-1.5" : ""}
            >
              {identity ? (
                <>
                  <Pencil className="h-3 w-3" />
                  Edit
                </>
              ) : (
                "Set Identity"
              )}
            </Button>
          </div>
        </div>

        {!identity ? (
          <div className="py-10 flex flex-col items-center text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#F2F2F2]">
              <UserCircle className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No agent identity configured</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-[360px]">
              Set an ERC-8004 identity to attach a verifiable on-chain identity to your x402 payments.
            </p>
          </div>
        ) : (
          <div className="p-5">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8E8E8] text-[#111111] text-sm font-bold shrink-0">
                {identity.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">{identity.name}</p>
                {identity.description && (
                  <p className="mt-1 text-xs text-[#888888] leading-relaxed">{identity.description}</p>
                )}
                <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                  <Badge>
                    {identity.agentId ? "ERC-8004 Registered" : "Not Registered"}
                  </Badge>
                  {identity.agentId && (
                    <span className="font-mono text-[11px] text-[#888888]">ID: {identity.agentId}</span>
                  )}
                </div>
                {identity.agentRegistry && (
                  <p className="mt-1.5 font-mono text-[11px] text-[#888888] truncate" title={identity.agentRegistry}>
                    {identity.agentRegistry}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent className="sm:max-w-[480px] p-0 gap-0">
          <IdentityWizard
            identity={identity}
            onSave={handleSave}
            onClose={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
