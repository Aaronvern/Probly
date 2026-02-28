"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { usePrices } from "@/hooks/usePrices";
import { Header } from "@/components/shared/Header";
import { MarketTable } from "@/components/matrix/MarketTable";
import { Activity, TrendingUp, Zap, AlertTriangle, Clock, ArrowUpRight } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const PLATFORM_COLORS: Record<string, string> = {
  opinion: "#F0B90B",
  predict: "#7C3AED",
  probable: "#0EA5E9",
  otc: "#10B981",
};

interface Trade {
  globalEventId: string;
  question: string;
  outcome: string;
  side: string;
  platform: string;
  amount: number;
  price: number;
  shares: number;
  txHash: string;
  simulated: boolean;
  timestamp: number;
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-terminal-surface border border-terminal-border rounded p-3 min-w-[120px]">
      <div className="text-xs text-terminal-muted font-mono uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-xl font-bold font-mono ${color ?? "text-terminal-text"}`}>{value}</div>
      {sub && <div className="text-xs text-terminal-muted font-mono mt-0.5">{sub}</div>}
    </div>
  );
}

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function MatrixTerminal() {
  const { markets, arbMarkets, updatedAt, loading, error, wsMarkets, priceHistory } = usePrices(2000);
  const { address } = useAccount();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);

  useEffect(() => {
    if (!address) { setTrades([]); return; }
    setTradesLoading(true);
    fetch(`${API}/api/trades/${address}`)
      .then((r) => r.json())
      .then((data) => setTrades(data.trades ?? []))
      .catch(() => {})
      .finally(() => setTradesLoading(false));
  }, [address]);

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

        <MarketTable markets={markets} loading={loading} priceHistory={priceHistory} />

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

        {/* Recent Orders */}
        {address && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-bnb" />
              <h2 className="text-lg font-bold font-mono text-terminal-text">
                RECENT <span className="text-bnb">ORDERS</span>
              </h2>
              <span className="text-xs text-terminal-muted font-mono ml-auto">
                {trades.length} trade{trades.length !== 1 ? "s" : ""}
              </span>
            </div>

            {tradesLoading && trades.length === 0 ? (
              <div className="text-center py-8 text-terminal-muted font-mono text-sm animate-pulse">
                Loading trade history...
              </div>
            ) : trades.length === 0 ? (
              <div className="border border-terminal-border rounded-lg p-6 text-center">
                <p className="text-terminal-muted font-mono text-sm">No trades yet — place your first bet above</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-terminal-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-terminal-border bg-terminal-surface">
                      <th className="text-left py-2.5 px-4 text-xs font-mono text-terminal-muted uppercase tracking-wider">Market</th>
                      <th className="text-center py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">Side</th>
                      <th className="text-center py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">Outcome</th>
                      <th className="text-center py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">Platform</th>
                      <th className="text-right py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">Amount</th>
                      <th className="text-right py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">Price</th>
                      <th className="text-right py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">Shares</th>
                      <th className="text-right py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">Time</th>
                      <th className="text-center py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.slice(0, 20).map((trade, i) => (
                      <tr
                        key={`${trade.txHash}-${trade.platform}-${i}`}
                        className="border-b border-terminal-border/50 hover:bg-terminal-surface/50 transition-colors"
                      >
                        <td className="py-3 px-4 max-w-[200px]">
                          <div className="text-xs text-terminal-text leading-snug line-clamp-1">{trade.question}</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`text-xs font-mono font-bold ${trade.side === "BUY" ? "text-terminal-green" : "text-terminal-red"}`}>
                            {trade.side}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`text-xs font-mono font-bold ${trade.outcome === "YES" ? "text-terminal-green" : "text-terminal-red"}`}>
                            {trade.outcome}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded font-bold"
                            style={{
                              color: PLATFORM_COLORS[trade.platform] ?? "#64748B",
                              border: `1px solid ${(PLATFORM_COLORS[trade.platform] ?? "#64748B") + "30"}`,
                              background: (PLATFORM_COLORS[trade.platform] ?? "#64748B") + "10",
                            }}
                          >
                            {trade.platform.slice(0, 3)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-terminal-text">
                          ${trade.amount.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-terminal-text">
                          ¢{Math.round(trade.price * 100)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-terminal-text">
                          {trade.shares.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-terminal-muted">
                          {timeAgo(trade.timestamp)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="text-[10px] font-mono text-terminal-muted" title={trade.txHash}>
                            {trade.txHash.slice(0, 6)}...
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
