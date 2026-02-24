import { useMemo } from "react";
import type { TransactionRecord, SpendingRules } from "../types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart3, TrendingUp, Hash, AlertTriangle } from "lucide-react";

interface SpendingBreakdownProps {
  transactions: TransactionRecord[];
  rules: SpendingRules | null;
  todaySpent: string;
}

export default function SpendingBreakdown({
  transactions,
  rules,
  todaySpent,
}: SpendingBreakdownProps) {
  const settled = useMemo(
    () => transactions.filter((t) => t.status === "settled"),
    [transactions],
  );

  const stats = useMemo(() => {
    if (settled.length === 0) return null;
    const amounts = settled.map((t) => parseFloat(t.amount) || 0);
    const total = amounts.reduce((a, b) => a + b, 0);
    const avg = total / amounts.length;
    const failed = transactions.filter((t) => t.status === "failed").length;
    return { total, count: settled.length, avg, failed };
  }, [settled, transactions]);

  // 7-day chart data
  const dailyData = useMemo(() => {
    const days: { label: string; amount: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString(undefined, { weekday: "short" });
      const dayTxs = settled.filter((t) => t.timestamp.startsWith(key));
      const amount = dayTxs.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
      days.push({ label, amount });
    }
    return days;
  }, [settled]);

  const maxDaily = Math.max(...dailyData.map((d) => d.amount), 0.01);

  // Service breakdown
  const serviceData = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const tx of settled) {
      const entry = map.get(tx.service) || { count: 0, total: 0 };
      entry.count += 1;
      entry.total += parseFloat(tx.amount) || 0;
      map.set(tx.service, entry);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5);
  }, [settled]);

  const maxServiceTotal = serviceData.length > 0 ? serviceData[0][1].total : 1;

  // Don't show if no settled transactions
  if (!stats) return null;

  const capNum = rules?.dailyCap ? parseFloat(rules.dailyCap) : 0;
  const spentNum = parseFloat(todaySpent) || 0;
  const capPct = capNum > 0 ? Math.min(100, (spentNum / capNum) * 100) : 0;

  return (
    <Card className="mb-6">
      <div className="px-5 py-3.5 border-b border-[#E8E8E8]">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Spending Analytics</h3>
        </div>
      </div>
      <div className="p-5">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
          <div className="rounded-[10px] bg-white p-4">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total</span>
            <p className="mt-1.5 font-mono text-xl font-bold">{stats.total.toFixed(2)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              USDC
            </p>
          </div>
          <div className="rounded-[10px] bg-white p-4">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Count</span>
            <p className="mt-1.5 font-mono text-xl font-bold">{stats.count}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1">
              <Hash className="h-3 w-3" />
              transactions
            </p>
          </div>
          <div className="rounded-[10px] bg-white p-4">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Average</span>
            <p className="mt-1.5 font-mono text-xl font-bold">{stats.avg.toFixed(4)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              USDC / tx
            </p>
          </div>
          <div className="rounded-[10px] bg-white p-4">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Failed</span>
            <p className="mt-1.5 font-mono text-xl font-bold">{stats.failed}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              transactions
            </p>
          </div>
        </div>

        {/* Daily Cap Usage */}
        {capNum > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium">Daily Cap Usage</p>
              <span className="font-mono text-xs text-muted-foreground">
                {spentNum.toFixed(2)} / {capNum.toFixed(2)} USDC
              </span>
            </div>
            <Progress value={capPct} className="h-2.5" />
            <p className="mt-1 text-[10px] text-muted-foreground text-right font-mono">
              {capPct.toFixed(0)}% used
            </p>
          </div>
        )}

        {/* Charts row */}
        <div className={`grid gap-5 ${serviceData.length > 0 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
          {/* 7-Day Chart */}
          <div className="rounded-[10px] bg-white p-4">
            <p className="text-xs font-medium mb-4">Last 7 Days</p>
            <div className="flex items-end gap-2 h-28">
              {dailyData.map((day, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 group" title={`${day.amount.toFixed(4)} USDC`}>
                  <div className="w-full flex justify-center" style={{ height: "96px", alignItems: "flex-end" }}>
                    <div
                      className="w-full max-w-[20px] rounded-t-[3px] bg-[#D0D0D0] transition-colors duration-150 group-hover:bg-[#111111]"
                      style={{ height: `${Math.max(2, (day.amount / maxDaily) * 96)}px` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{day.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Service Breakdown */}
          {serviceData.length > 0 && (
            <div className="rounded-[10px] bg-white p-4">
              <p className="text-xs font-medium mb-4">By Service</p>
              <div className="space-y-2.5">
                {serviceData.map(([service, data]) => (
                  <div key={service}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{service}</span>
                        <Badge>{data.count} tx</Badge>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {data.total.toFixed(4)} USDC
                      </span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-[#F2F2F2] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#D0D0D0] transition-all"
                        style={{ width: `${(data.total / maxServiceTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
