"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Header } from "@/components/shared/Header";
import { TrendingUp, TrendingDown, Wallet, RefreshCw, DollarSign, X, Zap } from "lucide-react";
import { otcQuote, otcCashOut, type OTCQuote, type OTCCashOutResult } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const PLATFORM_COLORS: Record<string, string> = {
  opinion: "#F0B90B",
  predict: "#7C3AED",
  probable: "#0EA5E9",
};

interface Position {
  globalEventId: string;
  question: string;
  outcome: string;
  platform: string;
  shares: number;
  avgEntryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
}

export default function PortfolioPage() {
  const { address } = useAccount();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OTC Cash-Out state
  const [otcModal, setOtcModal] = useState<{ pos: Position } | null>(null);
  const [quote, setQuote] = useState<OTCQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [cashOutLoading, setCashOutLoading] = useState(false);
  const [cashOutResult, setCashOutResult] = useState<OTCCashOutResult | null>(null);
  const [otcError, setOtcError] = useState<string | null>(null);

  const openOtcModal = async (pos: Position) => {
    setOtcModal({ pos });
    setQuote(null);
    setCashOutResult(null);
    setOtcError(null);
    setQuoteLoading(true);
    try {
      const q = await otcQuote(pos.globalEventId, pos.outcome, pos.shares);
      setQuote(q);
    } catch (e: any) {
      setOtcError(e.message);
    } finally {
      setQuoteLoading(false);
    }
  };

  const executeCashOut = async () => {
    if (!otcModal || !quote) return;
    setCashOutLoading(true);
    setOtcError(null);
    try {
      const result = await otcCashOut(
        otcModal.pos.globalEventId,
        otcModal.pos.outcome,
        otcModal.pos.shares,
        quote.usdtOut * 0.99, // 1% slippage tolerance
        address,
      );
      setCashOutResult(result);
      // Refresh portfolio after successful cash-out
      fetchPortfolio();
    } catch (e: any) {
      setOtcError(e.message);
    } finally {
      setCashOutLoading(false);
    }
  };

  const closeOtcModal = () => {
    setOtcModal(null);
    setQuote(null);
    setCashOutResult(null);
    setOtcError(null);
  };

  const fetchPortfolio = async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/portfolio/${address}`);
      if (!res.ok) throw new Error("Failed to fetch portfolio");
      const data = await res.json();
      setPositions(data.positions ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolio();
  }, [address]);

  const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
  const totalValue = positions.reduce((sum, p) => sum + p.shares * p.currentPrice, 0);

  return (
    <div className="min-h-screen bg-terminal-bg">
      <Header />

      <main className="max-w-[1200px] mx-auto px-4 py-6">
        {/* Title row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold font-mono text-terminal-text">
              PORT<span className="text-bnb">FOLIO</span>
            </h1>
            <p className="text-xs text-terminal-muted font-mono mt-0.5">
              Cross-platform positions & PnL
            </p>
          </div>
          {address && (
            <button
              onClick={fetchPortfolio}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded border border-terminal-border text-terminal-muted hover:text-terminal-text hover:border-bnb text-xs font-mono transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              REFRESH
            </button>
          )}
        </div>

        {!address ? (
          /* No wallet */
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Wallet className="w-12 h-12 text-terminal-muted" />
            <p className="text-terminal-muted font-mono text-sm">
              Connect your wallet to view positions
            </p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-terminal-surface border border-terminal-border rounded p-3">
                <div className="text-xs text-terminal-muted font-mono uppercase mb-1">Positions</div>
                <div className="text-xl font-bold font-mono text-terminal-text">{positions.length}</div>
              </div>
              <div className="bg-terminal-surface border border-terminal-border rounded p-3">
                <div className="text-xs text-terminal-muted font-mono uppercase mb-1">Portfolio Value</div>
                <div className="text-xl font-bold font-mono text-terminal-text">
                  ${totalValue.toFixed(2)}
                </div>
              </div>
              <div className="bg-terminal-surface border border-terminal-border rounded p-3">
                <div className="text-xs text-terminal-muted font-mono uppercase mb-1">Total PnL</div>
                <div className={`text-xl font-bold font-mono ${totalPnl >= 0 ? "text-terminal-green" : "text-terminal-red"}`}>
                  {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                </div>
              </div>
              <div className="bg-terminal-surface border border-terminal-border rounded p-3">
                <div className="text-xs text-terminal-muted font-mono uppercase mb-1">Platforms</div>
                <div className="flex gap-1 flex-wrap mt-1">
                  {["opinion", "predict", "probable"].map((p) => {
                    const hasPositions = positions.some((pos) => pos.platform === p);
                    return (
                      <span
                        key={p}
                        className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded"
                        style={{
                          color: hasPositions ? PLATFORM_COLORS[p] : "#475569",
                          border: `1px solid ${hasPositions ? PLATFORM_COLORS[p] + "40" : "#47556930"}`,
                          background: hasPositions ? PLATFORM_COLORS[p] + "10" : "transparent",
                        }}
                      >
                        {p.slice(0, 3)}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-4 border border-terminal-red/30 bg-terminal-red/5 rounded p-3 text-terminal-red font-mono text-xs">
                {error}
              </div>
            )}

            {/* Positions table */}
            {loading && positions.length === 0 ? (
              <div className="text-center py-12 text-terminal-muted font-mono text-sm animate-pulse">
                Scanning cross-platform positions...
              </div>
            ) : positions.length === 0 ? (
              <div className="text-center py-12 text-terminal-muted font-mono text-sm">
                No open positions found across Opinion, Predict.fun, or Probable
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-terminal-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-terminal-border bg-terminal-surface">
                      <th className="text-left py-2.5 px-4 text-xs font-mono text-terminal-muted uppercase tracking-wider">Market</th>
                      <th className="text-center py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">Platform</th>
                      <th className="text-center py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">Outcome</th>
                      <th className="text-right py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">Shares</th>
                      <th className="text-right py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">Avg Entry</th>
                      <th className="text-right py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">Current</th>
                      <th className="text-right py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">PnL</th>
                      <th className="text-center py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">OTC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos, i) => {
                      const isProfit = pos.pnl >= 0;
                      return (
                        <tr
                          key={`${pos.globalEventId}-${pos.platform}-${pos.outcome}-${i}`}
                          className="border-b border-terminal-border/50 hover:bg-terminal-surface/50 transition-colors"
                        >
                          <td className="py-3 px-4 max-w-xs">
                            <div className="text-xs text-terminal-text leading-snug line-clamp-2">{pos.question}</div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded font-bold"
                              style={{
                                color: PLATFORM_COLORS[pos.platform] ?? "#64748B",
                                border: `1px solid ${(PLATFORM_COLORS[pos.platform] ?? "#64748B") + "30"}`,
                                background: (PLATFORM_COLORS[pos.platform] ?? "#64748B") + "10",
                              }}
                            >
                              {pos.platform.slice(0, 3)}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`text-xs font-mono font-bold ${pos.outcome === "YES" ? "text-terminal-green" : "text-terminal-red"}`}
                            >
                              {pos.outcome}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-xs text-terminal-text">
                            {pos.shares.toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-xs text-terminal-text">
                            ¢{Math.round(pos.avgEntryPrice * 100)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-xs text-terminal-text">
                            ¢{Math.round(pos.currentPrice * 100)}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className={`flex items-center justify-end gap-1 font-mono text-xs font-bold ${isProfit ? "text-terminal-green" : "text-terminal-red"}`}>
                              {isProfit ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {isProfit ? "+" : ""}${pos.pnl.toFixed(2)}
                              <span className="text-[10px] opacity-70">({isProfit ? "+" : ""}{pos.pnlPercent.toFixed(1)}%)</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => openOtcModal(pos)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold uppercase border border-bnb/30 text-bnb hover:bg-bnb/10 hover:border-bnb/60 transition-colors"
                              title="Instant OTC Cash-Out at 5% discount"
                            >
                              <Zap className="w-3 h-3" />
                              CASH OUT
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>

      {/* OTC Cash-Out Modal */}
      {otcModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-terminal-surface border border-terminal-border rounded-lg w-full max-w-md mx-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-terminal-border">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-bnb" />
                <span className="font-mono text-sm font-bold text-terminal-text">OTC CASH-OUT</span>
              </div>
              <button onClick={closeOtcModal} className="text-terminal-muted hover:text-terminal-text transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Position info */}
              <div className="space-y-2">
                <p className="text-xs text-terminal-text leading-snug line-clamp-2">{otcModal.pos.question}</p>
                <div className="flex gap-2 text-[10px] font-mono">
                  <span
                    className="px-1.5 py-0.5 rounded font-bold"
                    style={{
                      color: PLATFORM_COLORS[otcModal.pos.platform] ?? "#64748B",
                      border: `1px solid ${(PLATFORM_COLORS[otcModal.pos.platform] ?? "#64748B") + "30"}`,
                    }}
                  >
                    {otcModal.pos.platform.toUpperCase()}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded font-bold ${otcModal.pos.outcome === "YES" ? "text-terminal-green border border-terminal-green/30" : "text-terminal-red border border-terminal-red/30"}`}>
                    {otcModal.pos.outcome}
                  </span>
                  <span className="text-terminal-muted px-1.5 py-0.5">
                    {otcModal.pos.shares.toFixed(2)} shares
                  </span>
                </div>
              </div>

              {/* Quote details */}
              {quoteLoading && (
                <div className="text-center py-6 text-terminal-muted font-mono text-xs animate-pulse">
                  Fetching OTC quote...
                </div>
              )}

              {otcError && (
                <div className="border border-terminal-red/30 bg-terminal-red/5 rounded p-3 text-terminal-red font-mono text-xs">
                  {otcError}
                </div>
              )}

              {cashOutResult ? (
                <div className="space-y-3">
                  <div className="border border-terminal-green/30 bg-terminal-green/5 rounded p-3 text-center">
                    <p className="text-terminal-green font-mono text-sm font-bold">Cash-Out Successful</p>
                    <p className="text-terminal-green/70 font-mono text-xs mt-1">
                      ${cashOutResult.usdtOut.toFixed(2)} USDT received
                    </p>
                  </div>
                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between text-terminal-muted">
                      <span>Tx Hash</span>
                      <span className="text-terminal-text truncate max-w-[200px]">{cashOutResult.txHash.slice(0, 10)}...{cashOutResult.txHash.slice(-8)}</span>
                    </div>
                    {cashOutResult.simulated && (
                      <div className="text-center text-[10px] text-terminal-muted/60 mt-2">
                        Simulated on testnet
                      </div>
                    )}
                  </div>
                  <button
                    onClick={closeOtcModal}
                    className="w-full py-2 rounded font-mono text-xs font-bold bg-terminal-border text-terminal-text hover:bg-terminal-border/80 transition-colors"
                  >
                    CLOSE
                  </button>
                </div>
              ) : quote && (
                <div className="space-y-3">
                  <div className="bg-terminal-bg rounded p-3 space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-terminal-muted">Fair Price</span>
                      <span className="text-terminal-text">¢{Math.round(quote.fairPrice * 100)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-terminal-muted">OTC Price (−{quote.discountPct}%)</span>
                      <span className="text-bnb font-bold">¢{Math.round(quote.discountedPrice * 100)}</span>
                    </div>
                    <div className="border-t border-terminal-border/50 my-1" />
                    <div className="flex justify-between">
                      <span className="text-terminal-muted">You Receive</span>
                      <span className="text-terminal-green font-bold text-sm">${quote.usdtOut.toFixed(2)} USDT</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-terminal-muted">Discount Fee</span>
                      <span className="text-terminal-red">−${quote.discount.toFixed(2)}</span>
                    </div>
                  </div>

                  <button
                    onClick={executeCashOut}
                    disabled={cashOutLoading}
                    className="w-full py-2.5 rounded font-mono text-xs font-bold bg-bnb text-black hover:bg-bnb/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {cashOutLoading ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        EXECUTING...
                      </>
                    ) : (
                      <>
                        <Zap className="w-3 h-3" />
                        CONFIRM CASH-OUT — ${quote.usdtOut.toFixed(2)}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
