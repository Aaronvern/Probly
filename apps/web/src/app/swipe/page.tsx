"use client";

import { useState } from "react";
import { usePrices } from "@/hooks/usePrices";
import { Header } from "@/components/shared/Header";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { SessionBanner } from "@/components/swipe/SessionBanner";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { RotateCcw } from "lucide-react";

export default function SwipePage() {
  const { markets, loading, wsMarkets } = usePrices(3000);
  const { address } = useAccount();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Only show markets with real prices
  const tradeable = markets.filter(
    (m) => m.yes.bestAsk !== null && m.no.bestAsk !== null && m.dataSource !== "none",
  );

  const handleNext = () => setCurrentIndex((i) => i + 1);
  const handleReset = () => setCurrentIndex(0);

  const remaining = tradeable.slice(currentIndex, currentIndex + 3);
  const done = currentIndex >= tradeable.length;

  return (
    <div className="min-h-screen bg-terminal-bg flex flex-col">
      <Header wsCount={wsMarkets} total={markets.length} />

      <main className="flex-1 flex flex-col items-center px-4 py-6 max-w-lg mx-auto w-full">
        {/* Session / connect */}
        <div className="w-full mb-6">
          {!address ? (
            <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4 text-center">
              <p className="text-sm text-terminal-muted font-mono mb-3">Connect wallet to trade</p>
              <ConnectButton />
            </div>
          ) : (
            <SessionBanner />
          )}
        </div>

        {/* Counter */}
        {tradeable.length > 0 && !done && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-mono text-terminal-muted">
              {currentIndex + 1} / {tradeable.length}
            </span>
            <div className="flex gap-1">
              {tradeable.slice(0, Math.min(tradeable.length, 10)).map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full transition-all ${
                    i < currentIndex ? "w-2 bg-terminal-muted/30" : i === currentIndex ? "w-4 bg-bnb" : "w-2 bg-terminal-muted/30"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Card stack */}
        <div className="relative w-full flex-1 flex items-start justify-center" style={{ minHeight: 580 }}>
          {loading && tradeable.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-terminal-muted font-mono text-sm animate-pulse">Loading markets...</div>
            </div>
          ) : done ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <div className="text-5xl">🎉</div>
              <div className="text-xl font-bold font-mono text-terminal-text">All done!</div>
              <p className="text-sm text-terminal-muted font-mono">You've seen all {tradeable.length} markets</p>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 rounded border border-terminal-border text-terminal-muted hover:text-terminal-text hover:border-bnb transition-colors font-mono text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                Start Over
              </button>
            </div>
          ) : (
            remaining.map((market, i) => (
              <SwipeCard
                key={market.globalEventId}
                market={market}
                onNext={handleNext}
                zIndex={remaining.length - i}
                isTop={i === 0}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
}
