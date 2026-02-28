"use client";

import { usePrices } from "@/hooks/usePrices";
import { Header } from "@/components/shared/Header";
import { MarketTable } from "@/components/matrix/MarketTable";
import { Activity, TrendingUp, Zap, AlertTriangle } from "lucide-react";

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-terminal-surface border border-terminal-border rounded p-3 min-w-[120px]">
      <div className="text-xs text-terminal-muted font-mono uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-xl font-bold font-mono ${color ?? "text-terminal-text"}`}>{value}</div>
      {sub && <div className="text-xs text-terminal-muted font-mono mt-0.5">{sub}</div>}
    </div>
  );
}

export default function MatrixTerminal() {
  const { markets, arbMarkets, updatedAt, loading, error, wsMarkets } = usePrices(2000);

  const msAgo = updatedAt ? Math.round((Date.now() - updatedAt) / 1000) : null;

  return (
    <div className="min-h-screen bg-terminal-bg">
      <Header wsCount={wsMarkets} total={markets.length} />

      <main className="max-w-[1400px] mx-auto px-4 py-6">
        {/* Title row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold font-mono text-terminal-text">
              MATRIX <span className="text-bnb">TERMINAL</span>
            </h1>
            <p className="text-xs text-terminal-muted font-mono mt-0.5">
              Real-time aggregated prediction market intelligence
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            {msAgo !== null && (
              <span className="text-xs text-terminal-muted font-mono">
                Updated {msAgo}s ago
              </span>
            )}
            <div className={`w-2 h-2 rounded-full ${loading ? "bg-bnb animate-pulse" : "bg-terminal-green"}`} />
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
          <StatCard label="Markets" value={markets.length} sub="active" />
          <StatCard
            label="Live WS"
            value={wsMarkets}
            sub={`${markets.length > 0 ? Math.round((wsMarkets / markets.length) * 100) : 0}% coverage`}
            color="text-terminal-green"
          />
          <StatCard
            label="Arb Opps"
            value={arbMarkets.length}
            sub="buy YES + NO < $1"
            color={arbMarkets.length > 0 ? "text-terminal-green" : "text-terminal-text"}
          />
          <StatCard
            label="Best Arb"
            value={arbMarkets.length > 0 ? `+${((arbMarkets[0]?.arbSpread ?? 0) * 100).toFixed(1)}¢` : "—"}
            sub={(arbMarkets[0]?.question?.slice(0, 20) ?? "none") + "..."}
            color="text-terminal-green"
          />
        </div>

        {/* Arb alert banner */}
        {arbMarkets.length > 0 && (
          <div className="mb-4 border border-terminal-green/30 bg-terminal-green/5 rounded p-3 flex items-start gap-3 animate-fade-in">
            <AlertTriangle className="w-4 h-4 text-terminal-green mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-terminal-green font-mono text-xs font-bold">
                {arbMarkets.length} ARB {arbMarkets.length === 1 ? "OPPORTUNITY" : "OPPORTUNITIES"} DETECTED
              </span>
              <p className="text-terminal-muted font-mono text-xs mt-0.5">
                Buy YES + NO for less than $1 — rows highlighted below
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 border border-terminal-red/30 bg-terminal-red/5 rounded p-3 text-terminal-red font-mono text-xs">
            API Error: {error} — retrying...
          </div>
        )}

        <MarketTable markets={markets} loading={loading} />

        {/* Legend */}
        <div className="mt-4 flex items-center gap-4 text-xs font-mono text-terminal-muted">
          <span className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-terminal-green" /> Live WS feed
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-terminal-muted" /> REST fallback
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 border-l-2 border-terminal-green bg-terminal-green/10 inline-block" /> Arb opportunity
          </span>
        </div>
      </main>
    </div>
  );
}
