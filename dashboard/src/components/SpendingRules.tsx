import { useState, useEffect, useMemo, useCallback, useRef, type KeyboardEvent } from "react";
import type { SpendingRules as SpendingRulesType } from "../types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Settings,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Shield,
  X,
} from "lucide-react";

type Step = 1 | 2 | 3;
type SaveStatus = "idle" | "saving" | "success" | "error";

interface SpendingRulesProps {
  rules: SpendingRulesType | null;
  onSave: (rules: SpendingRulesType) => Promise<void>;
  showToast: (msg: string, type?: "success" | "error") => void;
}

function validateUsdc(value: string): string | null {
  if (!value.trim()) return null;
  const num = Number(value);
  if (isNaN(num)) return "Must be a valid number";
  if (num <= 0) return "Must be greater than 0";
  const parts = value.split(".");
  if (parts.length === 2 && parts[1].length > 6) return "Max 6 decimal places";
  return null;
}

function StepBadge({ current, total = 3 }: { current: Step; total?: number }) {
  return (
    <span className="inline-flex items-center rounded-[6px] bg-[#E8E8E8] px-1.5 py-0.5 text-[11px] font-medium text-[#111111] tabular-nums">
      {current}/{total}
    </span>
  );
}

function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (value: string) => {
    const trimmed = value.trim().replace(/,$/, "").trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === " " || e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (input.trim()) addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    const items = text.split(/[\s,]+/).filter(Boolean);
    const unique = items.filter((item) => !tags.includes(item));
    if (unique.length > 0) {
      onChange([...tags, ...unique]);
    }
    setInput("");
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 min-h-[40px] bg-white rounded-[10px] px-3 py-2 cursor-text focus-within:border-[1.5px] focus-within:border-[#D0D0D0] border border-[#E0E0E0] transition-colors duration-150"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="inline-flex items-center gap-1 bg-[#E8E8E8] text-[#111111] rounded-[6px] px-2 py-0.5 text-[12px] font-mono font-medium"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeTag(i);
            }}
            className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full hover:bg-[#D0D0D0] transition-colors duration-150"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={() => { if (input.trim()) addTag(input); }}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm placeholder:text-[#888888]"
      />
    </div>
  );
}

function RulesWizard({
  rules,
  onSave,
  onClose,
}: {
  rules: SpendingRulesType | null;
  onSave: (rules: SpendingRulesType) => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [maxPerTx, setMaxPerTx] = useState("");
  const [dailyCap, setDailyCap] = useState("");
  const [allowed, setAllowed] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  useEffect(() => {
    if (rules) {
      setMaxPerTx(rules.maxPerTransaction || "");
      setDailyCap(rules.dailyCap || "");
      setAllowed(rules.allowedServices || []);
      setBlocked(rules.blockedServices || []);
    }
  }, [rules]);

  // Auto-dismiss on success
  useEffect(() => {
    if (saveStatus === "success") {
      const timer = setTimeout(() => onClose(), 1500);
      return () => clearTimeout(timer);
    }
  }, [saveStatus, onClose]);

  const maxPerTxError = useMemo(() => validateUsdc(maxPerTx), [maxPerTx]);
  const dailyCapBaseError = useMemo(() => validateUsdc(dailyCap), [dailyCap]);
  const dailyCapError = useMemo(() => {
    if (dailyCapBaseError) return dailyCapBaseError;
    if (dailyCap.trim() && maxPerTx.trim() && !validateUsdc(maxPerTx)) {
      const cap = Number(dailyCap);
      const perTx = Number(maxPerTx);
      if (cap < perTx) return "Daily cap cannot be lower than max per transaction";
    }
    return null;
  }, [dailyCapBaseError, dailyCap, maxPerTx]);
  const hasStep1Errors = !!maxPerTxError || !!dailyCapError;

  const goToStep = (target: Step, dir: "forward" | "back" = "forward") => {
    setDirection(dir);
    setStep(target);
  };

  const handleSave = async () => {
    goToStep(3, "forward");
    setSaveStatus("saving");
    setErrorMessage("");
    try {
      await onSave({
        maxPerTransaction: maxPerTx.trim() || null,
        dailyCap: dailyCap.trim() || null,
        allowedServices: allowed,
        blockedServices: blocked,
      });
      setSaveStatus("success");
    } catch (e: unknown) {
      setSaveStatus("error");
      setErrorMessage(e instanceof Error ? e.message : "Failed to save rules");
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
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E8E8E8]">
            <div className="flex items-center gap-2">
              <img src="/providers/usdcoin.png" alt="USDC" className="h-4 w-4" />
              <div>
                <h3 className="text-sm font-semibold">Transaction Limits</h3>
                <p className="text-xs text-[#888888] mt-0.5">Set maximum amounts per transaction and daily.</p>
              </div>
            </div>
            <StepBadge current={1} />
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#888888]">Max per transaction (USDC)</Label>
              <Input
                placeholder="No limit"
                value={maxPerTx}
                onChange={(e) => setMaxPerTx(e.target.value)}
                className={`font-mono ${maxPerTxError ? "border-[1.5px] border-[#D0D0D0]" : ""}`}
              />
              {maxPerTxError && <p className="text-xs text-[#888888]">{maxPerTxError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#888888]">Daily cap (USDC)</Label>
              <Input
                placeholder="No limit"
                value={dailyCap}
                onChange={(e) => setDailyCap(e.target.value)}
                className={`font-mono ${dailyCapError ? "border-[1.5px] border-[#D0D0D0]" : ""}`}
              />
              {dailyCapError && <p className="text-xs text-[#888888]">{dailyCapError}</p>}
            </div>
            <Button
              className="w-full gap-1.5"
              onClick={() => goToStep(2, "forward")}
              disabled={hasStep1Errors}
            >
              Next
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
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
              <Shield className="h-4 w-4 text-[#888888]" />
              <div>
                <h3 className="text-sm font-semibold">Service Filters</h3>
                <p className="text-xs text-[#888888] mt-0.5">Control which services can receive payments.</p>
              </div>
            </div>
            <StepBadge current={2} />
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#888888]">Allowed services</Label>
              <TagInput
                tags={allowed}
                onChange={setAllowed}
                placeholder="Type a domain and press Space"
              />
              <p className="text-[11px] text-[#888888]">Leave empty to allow all.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#888888]">Blocked services</Label>
              <TagInput
                tags={blocked}
                onChange={setBlocked}
                placeholder="Type a domain and press Space"
              />
              <p className="text-[11px] text-[#888888]">These override allowed services.</p>
            </div>
            <Button className="w-full" onClick={handleSave}>
              Save Rules
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div key="step3" className={translateClass}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E8E8E8]">
            <h3 className="text-sm font-semibold">
              {saveStatus === "success" ? "Done" : saveStatus === "error" ? "Error" : "Saving"}
            </h3>
            <StepBadge current={3} />
          </div>
          <div className="p-5 flex flex-col items-center justify-center min-h-[200px] text-center">
            {saveStatus === "saving" && (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F2F2F2] mb-4">
                  <Loader2 className="h-6 w-6 text-[#111111] animate-spin" />
                </div>
                <p className="text-sm font-medium text-[#111111]">Saving rules...</p>
              </>
            )}
            {saveStatus === "success" && (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F2F2F2] mb-4">
                  <CheckCircle2 className="h-6 w-6 text-[#111111]" />
                </div>
                <p className="text-sm font-medium text-[#111111]">Rules saved</p>
                <p className="text-xs text-[#888888] mt-1">Your spending rules are now active.</p>
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
        </div>
      )}
    </div>
  );
}

export default function SpendingRules({
  rules,
  onSave,
  showToast,
}: SpendingRulesProps) {
  const [open, setOpen] = useState(false);

  const isDefault =
    !rules ||
    (!rules.maxPerTransaction &&
      !rules.dailyCap &&
      (!rules.allowedServices || rules.allowedServices.length === 0) &&
      (!rules.blockedServices || rules.blockedServices.length === 0));

  const handleSave = useCallback(
    async (newRules: SpendingRulesType) => {
      await onSave(newRules);
      showToast("Rules saved");
    },
    [onSave, showToast],
  );

  return (
    <>
      <Card className="mb-6">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E8E8E8]">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Settings className="h-3.5 w-3.5 text-muted-foreground" />
            Spending Rules
          </h3>
          <Button size="sm" onClick={() => setOpen(true)} className={isDefault ? "" : "gap-1.5"}>
            {isDefault ? (
              "Configure Rules"
            ) : (
              <>
                <Pencil className="h-3 w-3" />
                Edit
              </>
            )}
          </Button>
        </div>
        {isDefault ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No spending rules configured. All transactions are allowed without limits.
          </div>
        ) : (
          <div className="p-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <div>
                <p className="text-[11px] font-medium text-[#888888] uppercase tracking-wider mb-0.5">Max / tx</p>
                <p className="text-sm font-mono font-medium">
                  {rules!.maxPerTransaction ? `${rules!.maxPerTransaction} USDC` : "No limit"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-[#888888] uppercase tracking-wider mb-0.5">Daily cap</p>
                <p className="text-sm font-mono font-medium">
                  {rules!.dailyCap ? `${rules!.dailyCap} USDC` : "No limit"}
                </p>
              </div>
            </div>
            {((rules!.allowedServices && rules!.allowedServices.length > 0) ||
              (rules!.blockedServices && rules!.blockedServices.length > 0)) && (
              <div className="mt-3.5 pt-3.5 border-t border-[#E8E8E8] space-y-2.5">
                {rules!.allowedServices && rules!.allowedServices.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-[#888888] uppercase tracking-wider mb-1.5">Allowed</p>
                    <div className="flex flex-wrap gap-1.5">
                      {rules!.allowedServices.map((s) => (
                        <code key={s} className="rounded-[6px] bg-[#E8E8E8] px-1.5 py-0.5 font-mono text-[11px]">{s}</code>
                      ))}
                    </div>
                  </div>
                )}
                {rules!.blockedServices && rules!.blockedServices.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-[#888888] uppercase tracking-wider mb-1.5">Blocked</p>
                    <div className="flex flex-wrap gap-1.5">
                      {rules!.blockedServices.map((s) => (
                        <code key={s} className="rounded-[6px] bg-[#E8E8E8] px-1.5 py-0.5 font-mono text-[11px]">{s}</code>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent className="sm:max-w-[480px] p-0 gap-0">
          <RulesWizard
            rules={rules}
            onSave={handleSave}
            onClose={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
