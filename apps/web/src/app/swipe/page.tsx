"use client";

import { useRef } from "react";
import { usePrices } from "@/hooks/usePrices";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { SessionBanner } from "@/components/swipe/SessionBanner";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { Activity, LayoutGrid } from "lucide-react";
import Link from "next/link";

export default function SwipePage() {
  const { markets, loading, wsMarkets } = usePrices(3000);
  const { address } = useAccount();
  const containerRef = useRef<HTMLDivElement>(null);

  const tradeable = markets.filter(
    (m) => m.yes.bestAsk !== null && m.no.bestAsk !== null && m.dataSource !== "none",
  );

  return (
    <div className="fixed inset-0 bg-terminal-bg flex flex-col" style={{ fontFamily: "monospace" }}>
      {/* Floating top bar — overlaid on feed */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-4 pb-2"
        style={{ background: "linear-gradient(to bottom, rgba(10,10,15,0.9) 0%, transparent 100%)" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-bnb font-bold text-lg tracking-tight font-mono">PROBLY</span>
          <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm rounded-full px-2 py-0.5">
            <Activity className="w-3 h-3 text-terminal-green" />
            <span className="text-[10px] text-terminal-green font-mono">{wsMarkets} live</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-terminal-muted hover:text-bnb transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
          </Link>
          {address ? (
            <div className="text-xs font-mono text-terminal-muted bg-black/40 backdrop-blur-sm rounded-full px-2 py-1">
              {address.slice(0, 6)}…{address.slice(-4)}
            </div>
          ) : (
            <ConnectButton accountStatus="avatar" chainStatus="none" showBalance={false} />
          )}
        </div>
      </div>

      {/* Session banner — shows as overlay if no session */}
      {address && (
        <div className="absolute bottom-32 left-4 right-4 z-30">
          <SessionBanner />
        </div>
      )}

      {/* Feed — full screen vertical scroll snap */}
      {loading && tradeable.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-terminal-muted font-mono text-sm animate-pulse">Loading markets...</div>
        </div>
      ) : tradeable.length === 0 ? (
        <div className="flex-1 flex items-center justify-center flex-col gap-3">
          <div className="text-terminal-muted font-mono text-sm">No markets available</div>
          <Link href="/" className="text-bnb font-mono text-xs underline">Back to Matrix</Link>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="flex-1 overflow-y-scroll"
          style={{
            scrollSnapType: "y mandatory",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
          }}
        >
          {/* Connect prompt as first card if no wallet */}
          {!address && (
            <div
              className="w-full flex flex-col items-center justify-center gap-4 bg-terminal-bg"
              style={{ height: "100dvh", scrollSnapAlign: "start" }}
            >
              <span className="text-bnb font-bold text-3xl font-mono">PROBLY</span>
              <p className="text-terminal-muted font-mono text-sm text-center px-8">
                Connect your wallet to trade on the best prediction markets
              </p>
              <ConnectButton />
              <button
                onClick={() => containerRef.current?.scrollTo({ top: window.innerHeight, behavior: "smooth" })}
                className="text-terminal-muted text-xs font-mono mt-4 animate-bounce"
              >
                ↓ Browse without trading
              </button>
            </div>
          )}

          {tradeable.map((market) => (
            <div
              key={market.globalEventId}
              style={{ height: "100dvh", scrollSnapAlign: "start", scrollSnapStop: "always" }}
              className="w-full relative"
            >
              <SwipeCard market={market} />
            </div>
          ))}

          {/* End card */}
          <div
            className="w-full flex flex-col items-center justify-center gap-4 bg-terminal-bg"
            style={{ height: "100dvh", scrollSnapAlign: "start" }}
          >
            <div className="text-4xl">🎉</div>
            <div className="text-xl font-bold font-mono text-terminal-text">You're all caught up</div>
            <p className="text-sm text-terminal-muted font-mono text-center px-8">
              You've seen all {tradeable.length} markets
            </p>
            <button
              onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
              className="px-5 py-2 rounded-full border border-bnb text-bnb font-mono text-sm hover:bg-bnb/10 transition-colors"
            >
              Back to top
            </button>
            <Link href="/" className="text-terminal-muted font-mono text-xs underline">
              Switch to Matrix Terminal
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
