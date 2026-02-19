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
          <div className="rounded-[10px] bg-white p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total</span>
            </div>
            <p className="font-mono text-lg font-bold">{stats.total.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">USDC</p>
          </div>
          <div className="rounded-[10px] bg-white p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Hash className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Count</span>
            </div>
            <p className="font-mono text-lg font-bold">{stats.count}</p>
            <p className="text-[10px] text-muted-foreground">transactions</p>
          </div>
          <div className="rounded-[10px] bg-white p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Average</span>
            </div>
            <p className="font-mono text-lg font-bold">{stats.avg.toFixed(4)}</p>
            <p className="text-[10px] text-muted-foreground">USDC / tx</p>
          </div>
          <div className="rounded-[10px] bg-white p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Failed</span>
            </div>
            <p className="font-mono text-lg font-bold">{stats.failed}</p>
            <p className="text-[10px] text-muted-foreground">transactions</p>
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

        {/* 7-Day Chart */}
        <div className="mb-6">
          <p className="text-xs font-medium mb-3">Last 7 Days</p>
          <div className="flex items-end gap-1.5 h-24">
            {dailyData.map((day, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full relative" style={{ height: "80px" }}>
                  <div
                    className="absolute bottom-0 w-full rounded-t bg-[#2563EB] transition-all hover:bg-[#1D4ED8]"
                    style={{
                      height: `${Math.max(2, (day.amount / maxDaily) * 80)}px`,
                    }}
                    title={`${day.amount.toFixed(4)} USDC`}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground">{day.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Service Breakdown */}
        {serviceData.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-3">By Service</p>
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
                  <div className="h-1.5 w-full rounded-full bg-[#E8E8E8] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#2563EB]/50 transition-all"
                      style={{ width: `${(data.total / maxServiceTotal) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
