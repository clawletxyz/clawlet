import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getProviderMeta, ProviderIcon } from "@/lib/providers";
import {
  Wallet,
  ChevronRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

type AdapterType = "local-key" | "privy" | "coinbase-cdp" | "crossmint" | "browser";
type Step = 1 | 2 | 3;
type CreationStatus = "idle" | "creating" | "success" | "error";

interface NoWalletProps {
  onCreate: (
    adapter: string,
    credentials?: Record<string, string>,
    label?: string,
  ) => Promise<void>;
  showToast: (msg: string, type?: "success" | "error") => void;
  inline?: boolean;
  onCancel?: () => void;
}

const PROVIDERS: {
  adapter: AdapterType;
  description: string;
  badge?: string;
}[] = [
  { adapter: "local-key", description: "Generate a local key. No service needed.", badge: "Default" },
  { adapter: "browser", description: "Connect your browser wallet.", badge: "Browser" },
  { adapter: "privy", description: "Managed wallet infrastructure." },
  { adapter: "coinbase-cdp", description: "Coinbase Developer Platform wallets." },
  { adapter: "crossmint", description: "Enterprise wallet-as-a-service." },
];

const CREDENTIAL_FIELDS: Record<
  string,
  { key: string; label: string; placeholder: string }[]
> = {
  privy: [
    { key: "appId", label: "App ID", placeholder: "Your Privy app ID" },
    { key: "appSecret", label: "App Secret", placeholder: "Your Privy app secret" },
  ],
  "coinbase-cdp": [
    { key: "apiKeyId", label: "API Key ID", placeholder: "Your CDP API key ID" },
    { key: "apiKeySecret", label: "API Key Secret", placeholder: "Your CDP API key secret" },
  ],
  crossmint: [
    { key: "apiKey", label: "API Key", placeholder: "Your Crossmint API key" },
  ],
};

function hasMetaMask(): boolean {
  return typeof window !== "undefined" && typeof window.ethereum !== "undefined";
}

function StepBadge({ current, total = 3 }: { current: Step; total?: number }) {
  return (
    <span className="inline-flex items-center rounded-[6px] bg-[#E8E8E8] px-1.5 py-0.5 text-[11px] font-medium text-[#111111] tabular-nums">
      {current}/{total}
    </span>
  );
}

export default function NoWallet({ onCreate, showToast, inline, onCancel }: NoWalletProps) {
  const [step, setStep] = useState<Step>(1);
  const [adapter, setAdapter] = useState<AdapterType>("local-key");
  const [walletLabel, setWalletLabel] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [creationStatus, setCreationStatus] = useState<CreationStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  const resetWizard = useCallback(() => {
    setStep(1);
    setAdapter("local-key");
    setWalletLabel("");
    setCredentials({});
    setCreationStatus("idle");
    setErrorMessage("");
    setDirection("forward");
  }, []);

  // Auto-dismiss on success
  useEffect(() => {
    if (creationStatus === "success") {
      const timer = setTimeout(() => {
        if (inline && onCancel) {
          onCancel();
        }
        resetWizard();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [creationStatus, inline, onCancel, resetWizard]);

  const goToStep = (target: Step, dir: "forward" | "back" = "forward") => {
    setDirection(dir);
    setStep(target);
  };

  const selectProvider = (a: AdapterType) => {
    setAdapter(a);
    setCredentials({});
    goToStep(2, "forward");
  };

  const fields = CREDENTIAL_FIELDS[adapter];
  const isBrowser = adapter === "browser";

  const isStep2Valid = (): boolean => {
    if (adapter === "local-key") return true;
    if (adapter === "browser") return hasMetaMask();
    if (fields) {
      return fields.every((f) => (credentials[f.key] || "").trim() !== "");
    }
    return true;
  };

  const connectMetaMask = async () => {
    if (!hasMetaMask()) {
      setCreationStatus("error");
      setErrorMessage("MetaMask not detected. Install the extension first.");
      return;
    }
    try {
      const accounts = await window.ethereum!.request({
        method: "eth_requestAccounts",
      }) as string[];
      if (!accounts[0]) throw new Error("No account selected");
      await onCreate("browser", { address: accounts[0] }, walletLabel || undefined);
      setCreationStatus("success");
    } catch (e: unknown) {
      setCreationStatus("error");
      setErrorMessage(e instanceof Error ? e.message : "Failed to connect MetaMask");
    }
  };

  const handleCreate = async () => {
    goToStep(3, "forward");
    setCreationStatus("creating");
    setErrorMessage("");

    if (isBrowser) {
      await connectMetaMask();
      return;
    }

    try {
      await onCreate(adapter, fields ? credentials : undefined, walletLabel || undefined);
      setCreationStatus("success");
    } catch (e: unknown) {
      setCreationStatus("error");
      setErrorMessage(e instanceof Error ? e.message : "Failed to create wallet");
    }
  };

  const handleRetry = () => {
    goToStep(2, "back");
    setCreationStatus("idle");
    setErrorMessage("");
  };

  const translateClass =
    direction === "forward"
      ? "animate-[slideInRight_200ms_ease-out]"
      : "animate-[slideInLeft_200ms_ease-out]";

  const wizardContent = (
    <div className="overflow-hidden">
      {step === 1 && (
        <div key="step1" className={translateClass}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E8E8E8]">
            <div>
              <h3 className="text-sm font-semibold">Choose a Provider</h3>
              <p className="text-xs text-[#888888] mt-0.5">
                Select how your agent wallet will be managed.
              </p>
            </div>
            <StepBadge current={1} />
          </div>
          <div className="p-4 space-y-2">
            {PROVIDERS.map((provider) => {
              const meta = getProviderMeta(provider.adapter);
              return (
                <button
                  key={provider.adapter}
                  onClick={() => selectProvider(provider.adapter)}
                  className="w-full flex items-center gap-3.5 p-3.5 bg-white rounded-[16px] hover:bg-[#F5F5F5] cursor-pointer active:scale-[0.98] transition-all duration-150 text-left"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F2F2F2] overflow-hidden">
                    <ProviderIcon adapter={provider.adapter} size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#111111]">{meta.name}</span>
                      {provider.badge && (
                        <span className="bg-[#E8E8E8] text-[#111111] rounded-[6px] text-[11px] font-medium px-1.5 py-0.5">
                          {provider.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#888888] mt-0.5">{provider.description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#888888] shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 2 && (
        <div key="step2" className={translateClass}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E8E8E8]">
            <div className="flex items-center gap-2">
              <button
                onClick={() => goToStep(1, "back")}
                className="p-1 rounded-full hover:bg-[#F2F2F2] transition-colors duration-150"
              >
                <ArrowLeft className="h-4 w-4 text-[#111111]" />
              </button>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F2F2F2] overflow-hidden">
                <ProviderIcon adapter={adapter} size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Configure</h3>
                <p className="text-xs text-[#888888] mt-0.5">
                  {getProviderMeta(adapter).name}
                </p>
              </div>
            </div>
            <StepBadge current={2} />
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#888888]">Wallet Label</Label>
              <Input
                placeholder="e.g. Agent Wallet, Treasury"
                value={walletLabel}
                onChange={(e) => setWalletLabel(e.target.value)}
              />
            </div>

            {fields?.map((field) => (
              <div className="space-y-1.5" key={field.key}>
                <Label className="text-xs font-medium text-[#888888]">{field.label}</Label>
                <Input
                  placeholder={field.placeholder}
                  value={credentials[field.key] || ""}
                  onChange={(e) =>
                    setCredentials((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                />
              </div>
            ))}

            {isBrowser && (
              <div className="flex items-center gap-3 rounded-[10px] bg-white border border-[#E0E0E0] p-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F2F2F2] overflow-hidden">
                  <ProviderIcon adapter="browser" size={18} />
                </div>
                <p className="text-sm text-[#111111]">
                  {hasMetaMask()
                    ? "MetaMask detected — click below to connect."
                    : "MetaMask not detected. Install the extension to continue."}
                </p>
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleCreate}
              disabled={!isStep2Valid()}
            >
              {isBrowser ? "Connect MetaMask" : "Create Wallet"}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div key="step3" className={translateClass}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E8E8E8]">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F2F2F2] overflow-hidden">
                <ProviderIcon adapter={adapter} size={16} />
              </div>
              <h3 className="text-sm font-semibold">
                {creationStatus === "success" ? "Done" : creationStatus === "error" ? "Error" : "Creating"}
              </h3>
            </div>
            <StepBadge current={3} />
          </div>
          <div className="p-5 flex flex-col items-center justify-center min-h-[240px] text-center">
            {creationStatus === "creating" && (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F2F2F2] mb-4 overflow-hidden">
                  <ProviderIcon adapter={adapter} size={28} />
                </div>
                <p className="text-sm font-medium text-[#111111]">
                  {isBrowser ? "Connecting..." : "Creating wallet..."}
                </p>
                <p className="text-xs text-[#888888] mt-1">
                  Setting up {getProviderMeta(adapter).name}
                </p>
              </>
            )}

            {creationStatus === "success" && (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F2F2F2] mb-4">
                  <CheckCircle2 className="h-6 w-6 text-[#111111]" />
                </div>
                <p className="text-sm font-medium text-[#111111]">
                  {isBrowser ? "Connected" : "Wallet created"}
                </p>
                <p className="text-xs text-[#888888] mt-1">
                  {getProviderMeta(adapter).name} is ready to use.
                </p>
              </>
            )}

            {creationStatus === "error" && (
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
        </div>
      )}
    </div>
  );

  if (inline) {
    return wizardContent;
  }

  return (
    <>
      <div className="py-16 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F2F2F2]">
          <Wallet className="h-6 w-6 text-[#888888]" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">No wallet configured</h2>
        <p className="mt-1 text-sm text-[#888888]">
          Create a wallet to get started with agent payments.
        </p>
      </div>

      <Card className="mx-auto max-w-[480px] mb-6">
        {wizardContent}
      </Card>
    </>
  );
}
