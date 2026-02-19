import { useState } from "react";
import type { NetworkId } from "../types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Zap, Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import CopyButton from "./CopyButton";
import { explorerTxUrl, explorerIcon, toCaip2 } from "@/lib/explorer";

interface QuickPaymentProps {
  onPay: (url: string, method: string) => Promise<{
    status: number;
    body: string | null;
    payment: { txHash: string | null; amount: string; to: string } | null;
    error?: string;
  }>;
  frozen: boolean;
  network: NetworkId;
  adapterType: string | null;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
}

export default function QuickPayment({ onPay, frozen, network, adapterType, showToast }: QuickPaymentProps) {
  const isTestnet = network === "base-sepolia";
  const isBrowser = adapterType === "browser";
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("GET");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"idle" | "preparing" | "signing" | "completing">("idle");
  const [result, setResult] = useState<{
    status: number;
    body: string | null;
    payment: { txHash: string | null; amount: string; to: string } | null;
    error?: string;
  } | null>(null);

  const handlePay = async () => {
    if (!url.trim()) {
      showToast("Enter a URL", "error");
      return;
    }
    setLoading(true);
    setResult(null);
    setPhase(isBrowser ? "preparing" : "idle");
    try {
      // For browser wallets, track phases via a wrapper
      let res: typeof result;
      if (isBrowser) {
        // onPay internally handles prepare → sign → complete,
        // but we track phases via timeouts since the promise hangs during MetaMask
        const payPromise = onPay(url.trim(), method);
        // After a short delay (server prepare is fast), assume we're at signing phase
        const signingTimer = setTimeout(() => setPhase("signing"), 800);
        res = await payPromise;
        clearTimeout(signingTimer);
        setPhase("completing");
      } else {
        res = await onPay(url.trim(), method);
      }
      setResult(res);
      if (res?.payment) {
        showToast(`Paid ${res.payment.amount} ${isTestnet ? "Testnet USDC" : "USDC"}`, "success");
      } else if (res?.error) {
        showToast(res.error, "error");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Payment failed";
      showToast(msg, "error");
    } finally {
      setLoading(false);
      setPhase("idle");
    }
  };

  const isSuccess = result && result.status >= 200 && result.status < 300;
  const isError = result && (result.error || result.status >= 400);

  return (
    <Card className="mb-6" id="quick-payment">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E8E8E8]">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Quick Payment</h3>
        </div>
        {frozen && <Badge>Wallet Frozen</Badge>}
      </div>
      <div className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <p className="text-xs text-muted-foreground flex-1">
            Make an x402 payment to any URL. The server will respond with a 402 Payment Required, and clawlet will handle the payment automatically.
          </p>
          <Badge className="shrink-0 inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isTestnet ? "border border-[#888888]" : "bg-[#111111]"}`} />
            {isTestnet ? "Testnet" : "Mainnet"}
          </Badge>
        </div>

        <div className="space-y-2 mb-4">
          <div>
            <Label className="sr-only">URL</Label>
            <Input
              placeholder="https://api.example.com/paid-endpoint"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="font-mono text-xs w-full"
              disabled={frozen || loading}
              onKeyDown={(e) => e.key === "Enter" && !frozen && !loading && handlePay()}
            />
          </div>
          <div className="flex gap-2">
            <div className="w-[100px]">
              <Label className="sr-only">Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handlePay}
              disabled={frozen || loading || !url.trim()}
              className="flex-1 gap-1.5"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {isBrowser
                    ? phase === "signing"
                      ? "Sign in MetaMask..."
                      : phase === "completing"
                        ? "Completing..."
                        : "Preparing..."
                    : "Paying..."}
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5" />
                  Pay
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className="rounded-[10px] p-4 bg-white">
            <div className="flex items-center gap-2 mb-2">
              {isSuccess ? (
                <CheckCircle2 className="h-4 w-4 text-[#111111]" />
              ) : isError ? (
                <XCircle className="h-4 w-4 text-[#888888]" />
              ) : null}
              <span className="text-sm font-medium">
                {isSuccess
                  ? "Payment Successful"
                  : isError
                    ? result.error || `Error (${result.status})`
                    : `Response (${result.status})`}
              </span>
              {result.status > 0 && (
                <Badge>
                  {result.status}
                </Badge>
              )}
            </div>

            {result.payment && (
              <div className="space-y-1.5 mt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-mono font-semibold">{result.payment.amount} {isTestnet ? "Testnet USDC" : "USDC"}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">To</span>
                  <span className="font-mono">
                    <CopyButton text={result.payment.to} displayText={result.payment.to.slice(0, 10) + "..." + result.payment.to.slice(-6)} />
                  </span>
                </div>
                {result.payment.txHash && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Tx Hash</span>
                    <a
                      href={explorerTxUrl(result.payment.txHash, toCaip2(network))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono hover:underline transition-colors"
                    >
                      {explorerIcon(network) ? (
                        <img src={explorerIcon(network)!} alt="" className="h-3 w-3" />
                      ) : null}
                      {result.payment.txHash.slice(0, 10) + "..." + result.payment.txHash.slice(-6)}
                      <ExternalLink className="h-3 w-3 opacity-40" />
                    </a>
                  </div>
                )}
              </div>
            )}

            {result.body && (
              <details className="mt-3">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  Response body
                </summary>
                <pre className="mt-2 max-h-32 overflow-auto rounded-[6px] bg-[#F2F2F2] p-2 text-[11px] font-mono text-foreground">
                  {result.body.slice(0, 2000)}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
