"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { getQuote, executeTrade, type MarketPrice, type QuoteResponse } from "@/lib/api";
import { X, Zap, TrendingUp } from "lucide-react";
import { DepthChart } from "./DepthChart";

interface TradePanelProps {
  market: MarketPrice;
  onClose: () => void;
}

export function TradePanel({ market, onClose }: TradePanelProps) {
  const { address } = useAccount();
  const [outcome, setOutcome] = useState<"YES" | "NO">("YES");
  const [amount, setAmount] = useState("50");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"trade" | "depth">("trade");

  const handleQuote = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const q = await getQuote(market.globalEventId, outcome, Number(amount));
      setQuote(q);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    setExecuting(true);
    setError(null);
    try {
      const r = await executeTrade(market.globalEventId, outcome, Number(amount), 0.05, address ?? undefined);
      setResult(r);
      setQuote(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExecuting(false);
    }
  };

  const price = outcome === "YES" ? market.yes.bestAsk : market.no.bestAsk;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-terminal-surface border border-terminal-border rounded-lg w-full max-w-md p-6 shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs text-terminal-muted mb-1 font-mono">TRADE</div>
            <div className="text-sm text-terminal-text leading-snug max-w-xs">{market.question}</div>
          </div>
          <button onClick={onClose} className="text-terminal-muted hover:text-terminal-text ml-4">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-terminal-border pb-3">
          {(["trade", "depth"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded text-xs font-mono uppercase transition-colors ${
                tab === t
                  ? "bg-bnb/10 text-bnb border border-bnb/30"
                  : "text-terminal-muted hover:text-terminal-text border border-transparent"
              }`}
            >
              {t === "trade" ? "Trade" : "Depth"}
            </button>
          ))}
        </div>

        {tab === "trade" && (
          <>
            {/* Outcome selector */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(["YES", "NO"] as const).map((o) => {
                const p = o === "YES" ? market.yes.bestAsk : market.no.bestAsk;
                const isSelected = outcome === o;
                return (
                  <button
                    key={o}
                    onClick={() => { setOutcome(o); setQuote(null); }}
                    className={`p-3 rounded border font-mono text-sm transition-all ${
                      isSelected
                        ? o === "YES"
                          ? "border-terminal-green bg-terminal-green/10 text-terminal-green"
                          : "border-terminal-red bg-terminal-red/10 text-terminal-red"
                        : "border-terminal-border text-terminal-muted hover:border-terminal-muted"
                    }`}
                  >
                    <div className="font-bold">{o}</div>
                    <div className="text-xs mt-0.5">{p !== null ? `¢${Math.round(p * 100)}` : "—"}</div>
                  </button>
                );
              })}
            </div>

            {/* Amount */}
            <div className="mb-4">
              <label className="text-xs text-terminal-muted font-mono mb-1 block">AMOUNT (USDT)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setQuote(null); }}
                  className="flex-1 bg-terminal-bg border border-terminal-border rounded px-3 py-2 text-sm font-mono text-terminal-text focus:outline-none focus:border-bnb"
                  min="1"
                  step="1"
                />
                {[10, 50, 100].map((v) => (
                  <button
                    key={v}
                    onClick={() => { setAmount(String(v)); setQuote(null); }}
                    className="px-2 py-1 text-xs font-mono border border-terminal-border rounded text-terminal-muted hover:border-bnb hover:text-bnb transition-colors"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Quote result */}
            {quote && (
              <div className="mb-4 bg-terminal-bg border border-terminal-border rounded p-3 font-mono text-xs space-y-1">
                <div className="flex justify-between text-terminal-muted">
                  <span>Avg Price</span>
                  <span className="text-terminal-text">¢{Math.round(quote.route.weightedAvgPrice * 100)}</span>
                </div>
                <div className="flex justify-between text-terminal-muted">
                  <span>Shares</span>
                  <span className="text-terminal-text">{Number(quote.route.estimatedShares).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-terminal-muted">
                  <span>Total Cost</span>
                  <span className="text-terminal-text">${quote.route.totalCost} USDT</span>
                </div>
                <div className="border-t border-terminal-border pt-1 mt-1">
                  {quote.route.legs.map((leg, i) => (
                    <div key={i} className="flex justify-between text-terminal-muted">
                      <span className="text-bnb">{leg.platform}</span>
                      <span>{leg.allocationPct}% @ ¢{Math.round(leg.expectedPrice * 100)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Execution result */}
            {result && (
              <div className={`mb-4 border rounded p-3 font-mono text-xs ${result.success ? "border-terminal-green bg-terminal-green/5 text-terminal-green" : "border-terminal-red bg-terminal-red/5 text-terminal-red"}`}>
                {result.success ? "✓ Trade executed" : "✗ Trade failed"}
                {result.legs?.map((l: any, i: number) => (
                  <div key={i} className="mt-1 text-terminal-muted">
                    {l.platform}: ${l.amount} {l.simulated ? "(simulated)" : `→ ${l.orderId?.slice(0, 16)}...`}
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="mb-4 text-xs text-terminal-red font-mono border border-terminal-red/30 rounded p-2">
                {error}
              </div>
            )}

            {/* Actions */}
            {!address ? (
              <div className="text-xs text-terminal-muted font-mono text-center py-2">Connect wallet to trade</div>
            ) : !quote && !result ? (
              <button
                onClick={handleQuote}
                disabled={loading || !amount}
                className="w-full py-2.5 rounded font-mono text-sm font-bold bg-bnb text-terminal-bg hover:bg-bnb-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <TrendingUp className="w-4 h-4" />
                {loading ? "ROUTING..." : "GET QUOTE"}
              </button>
            ) : quote ? (
              <button
                onClick={handleExecute}
                disabled={executing}
                className="w-full py-2.5 rounded font-mono text-sm font-bold bg-terminal-green text-terminal-bg hover:bg-terminal-green/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" />
                {executing ? "EXECUTING..." : "EXECUTE TRADE"}
              </button>
            ) : (
              <button
                onClick={() => { setResult(null); setQuote(null); }}
                className="w-full py-2.5 rounded font-mono text-sm border border-terminal-border text-terminal-muted hover:text-terminal-text transition-colors"
              >
                NEW TRADE
              </button>
            )}
          </>
        )}

        {tab === "depth" && (
          <DepthChart globalEventId={market.globalEventId} outcome={outcome} />
        )}
      </div>
    </div>
  );
}
