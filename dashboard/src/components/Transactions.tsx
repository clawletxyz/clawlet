import { useState, useMemo } from "react";
import type { TransactionRecord } from "../types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, ExternalLink, AlertCircle, CheckCircle2, Clock, XCircle } from "lucide-react";
import CopyButton from "./CopyButton";
import Skeleton from "./Skeleton";
import { explorerTxUrl, explorerName, explorerIcon } from "@/lib/explorer";

function truncate(str: string | null, len = 6): string {
  if (!str || str.length <= len * 2 + 2) return str || "--";
  return str.slice(0, len) + "\u2026" + str.slice(-len);
}

function timeFmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function isTestnetNetwork(net: string): boolean {
  return net.includes("84532");
}

function networkShort(net: string): string {
  if (isTestnetNetwork(net)) return "Testnet";
  if (net.includes("8453")) return "Mainnet";
  return net;
}

type StatusFilter = "all" | "settled" | "pending" | "failed";

interface TransactionsProps {
  transactions: TransactionRecord[];
  onRefresh: () => void;
  loading?: boolean;
}

export default function Transactions({
  transactions,
  onRefresh,
  loading,
}: TransactionsProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [serviceFilter, setServiceFilter] = useState("__all__");

  const services = useMemo(() => {
    const set = new Set(transactions.map((tx) => tx.service));
    return Array.from(set).sort();
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      if (statusFilter !== "all" && tx.status !== statusFilter) return false;
      if (serviceFilter !== "__all__" && tx.service !== serviceFilter) return false;
      return true;
    });
  }, [transactions, statusFilter, serviceFilter]);

  const [expandedMobile, setExpandedMobile] = useState<string | null>(null);

  const renderSkeletonRows = () =>
    Array.from({ length: 5 }).map((_, i) => (
      <tr key={`skel-${i}`}>
        <td className="px-4 py-3"><Skeleton width="100px" height="14px" /></td>
        <td className="px-4 py-3"><Skeleton width="80px" height="14px" /></td>
        <td className="px-4 py-3"><Skeleton width="60px" height="14px" /></td>
        <td className="px-4 py-3"><Skeleton width="80px" height="14px" /></td>
        <td className="px-4 py-3"><Skeleton width="50px" height="14px" /></td>
        <td className="px-4 py-3"><Skeleton width="60px" height="20px" /></td>
        <td className="px-4 py-3"><Skeleton width="90px" height="14px" /></td>
      </tr>
    ));

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E8E8E8] flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Transactions</h3>
          {!loading && filtered.length !== transactions.length && (
            <span className="font-mono text-xs text-muted-foreground">
              {filtered.length} / {transactions.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="settled">Settled</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          {services.length > 0 && (
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Services</SelectItem>
                {services.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onRefresh}>
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Table content */}
      {loading ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F2F2F2]">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Time</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Service</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Network</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tx Hash</th>
              </tr>
            </thead>
            <tbody>{renderSkeletonRows()}</tbody>
          </table>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {transactions.length === 0
            ? "No transactions yet"
            : "No transactions match filters"}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="overflow-x-auto hidden sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E0E0E0]">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#888888] whitespace-nowrap">Time</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#888888] whitespace-nowrap">Service</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#888888] whitespace-nowrap">Amount</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#888888] whitespace-nowrap">To</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#888888] whitespace-nowrap">Network</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#888888] whitespace-nowrap">Status</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#888888] whitespace-nowrap">Tx Hash</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => (
                  <>
                    <tr
                      key={tx.id}
                      className="border-b border-[#F0F0F0] transition-colors hover:bg-white"
                    >
                      <td className="px-4 py-3 text-xs text-[#888888] whitespace-nowrap">{timeFmt(tx.timestamp)}</td>
                      <td className="px-4 py-3 text-[13px] font-medium whitespace-nowrap">{tx.service}</td>
                      <td className="px-4 py-3 font-mono text-[13px] font-semibold text-[#111111] whitespace-nowrap">{tx.amount} <span className="text-[11px] font-normal text-[#888888]">{isTestnetNetwork(tx.network) ? "Testnet USDC" : "USDC"}</span></td>
                      <td className="px-4 py-3 font-mono text-xs text-[#888888] whitespace-nowrap">
                        {tx.to ? (
                          <CopyButton text={tx.to} displayText={truncate(tx.to)} />
                        ) : "--"}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#888888] whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isTestnetNetwork(tx.network) ? "border border-[#888888]" : "bg-[#111111]"}`} />
                          {networkShort(tx.network)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {tx.status === "settled" && <CheckCircle2 className="h-3 w-3 text-[#111111]" />}
                          {tx.status === "pending" && <Clock className="h-3 w-3 text-[#888888]" />}
                          {tx.status === "failed" && <XCircle className="h-3 w-3 text-[#888888]" />}
                          <span className={`text-xs font-medium ${tx.status === "settled" ? "text-[#111111]" : "text-[#888888]"}`}>
                            {tx.status}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                        {tx.txHash ? (
                          <span className="inline-flex items-center gap-1">
                            <a
                              href={explorerTxUrl(tx.txHash, tx.network)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[#888888] hover:text-[#111111] hover:underline transition-colors"
                            >
                              {explorerIcon(tx.network) ? (
                                <img src={explorerIcon(tx.network)!} alt="" className="h-3 w-3 shrink-0" />
                              ) : null}
                              {truncate(tx.txHash)}
                              <ExternalLink className="h-3 w-3 opacity-40" />
                            </a>
                            <CopyButton text={tx.txHash} iconOnly />
                          </span>
                        ) : (
                          <span className="text-[#D0D0D0]">--</span>
                        )}
                      </td>
                    </tr>
                    {tx.status === "failed" && tx.reason && (
                      <tr key={`${tx.id}-reason`} className="border-b border-[#F0F0F0]">
                        <td colSpan={7} className="px-4 py-2 bg-white">
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-[#888888]">
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            {tx.reason}
                          </span>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="sm:hidden">
            {filtered.map((tx) => {
              const isExpanded = expandedMobile === tx.id;
              return (
                <div
                  key={tx.id}
                  className={`border-b border-[#F0F0F0] last:border-b-0 ${isExpanded ? "bg-[#F2F2F2]" : ""}`}
                >
                  <button
                    className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-[#F2F2F2]"
                    onClick={() => setExpandedMobile(isExpanded ? null : tx.id)}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">{timeFmt(tx.timestamp)}</span>
                      <span className="text-sm font-medium">{tx.service}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-mono text-sm font-semibold">{tx.amount} <span className="text-xs font-normal text-[#888888]">USDC</span></span>
                      <span className="inline-flex items-center gap-1">
                        {tx.status === "settled" && <CheckCircle2 className="h-3 w-3 text-[#111111]" />}
                        {tx.status === "pending" && <Clock className="h-3 w-3 text-[#888888]" />}
                        {tx.status === "failed" && <XCircle className="h-3 w-3 text-[#888888]" />}
                        <span className={`text-xs font-medium ${tx.status === "settled" ? "text-[#111111]" : "text-[#888888]"}`}>{tx.status}</span>
                      </span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-5 pb-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">To</span>
                        <span className="font-mono">
                          {tx.to ? <CopyButton text={tx.to} displayText={truncate(tx.to, 8)} /> : "--"}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Network</span>
                        <span className="inline-flex items-center gap-1.5 font-mono">
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isTestnetNetwork(tx.network) ? "border border-[#888888]" : "bg-[#111111]"}`} />
                          {networkShort(tx.network)}
                        </span>
                      </div>
                      {tx.txHash && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Tx Hash</span>
                          <a
                            href={explorerTxUrl(tx.txHash, tx.network)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono hover:underline transition-colors"
                          >
                            {explorerIcon(tx.network) ? (
                              <img src={explorerIcon(tx.network)!} alt="" className="h-3 w-3 shrink-0" />
                            ) : null}
                            {truncate(tx.txHash, 8)}
                            <ExternalLink className="h-3 w-3 opacity-40" />
                          </a>
                        </div>
                      )}
                      {tx.status === "failed" && tx.reason && (
                        <div className="flex items-center gap-1.5 text-xs text-[#888888]">
                          <AlertCircle className="h-3 w-3" />
                          {tx.reason}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
