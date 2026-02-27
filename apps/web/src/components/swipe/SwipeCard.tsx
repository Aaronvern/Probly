"use client";

import { useState, useRef } from "react";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import { useSmartAccount } from "@/hooks/useSmartAccount";
import { executeTrade, type MarketPrice } from "@/lib/api";
import { MessageCircle, TrendingUp, TrendingDown, Zap, Share2, UserPlus } from "lucide-react";
import { CommentSheet } from "./CommentSheet";
import { followUser } from "@/lib/api";

const PLATFORM_COLORS: Record<string, string> = {
  opinion: "#F0B90B",
  predict: "#7C3AED",
  probable: "#0EA5E9",
};

interface SwipeCardProps {
  market: MarketPrice;
  onNext: () => void;
  zIndex: number;
  isTop: boolean;
}

export function SwipeCard({ market, onNext, zIndex, isTop }: SwipeCardProps) {
  const { address } = useAccount();
  const { isActive } = useSmartAccount();
  const [showComments, setShowComments] = useState(false);
  const [trading, setTrading] = useState<"YES" | "NO" | null>(null);
  const [tradeResult, setTradeResult] = useState<{ outcome: "YES" | "NO"; success: boolean } | null>(null);
  const [followed, setFollowed] = useState(false);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const yesOpacity = useTransform(x, [30, 120], [0, 1]);
  const noOpacity = useTransform(x, [-120, -30], [1, 0]);
  const cardOpacity = useTransform(x, [-300, -200, 0, 200, 300], [0, 1, 1, 1, 0]);

  const yesCents = market.yes.bestAsk !== null ? Math.round(market.yes.bestAsk * 100) : null;
  const noCents = market.no.bestAsk !== null ? Math.round(market.no.bestAsk * 100) : null;

  const handleDragEnd = async (_: any, info: { offset: { x: number } }) => {
    const threshold = 120;
    if (info.offset.x > threshold) {
      await handleTrade("YES");
    } else if (info.offset.x < -threshold) {
      await handleTrade("NO");
    } else {
      x.set(0);
    }
  };

  const handleTrade = async (outcome: "YES" | "NO") => {
    if (!address) return;
    setTrading(outcome);
    try {
      const result = await executeTrade(market.globalEventId, outcome, 10);
      setTradeResult({ outcome, success: result.success });
      setTimeout(() => {
        setTradeResult(null);
        onNext();
      }, 1200);
    } catch {
      setTradeResult({ outcome, success: false });
      setTimeout(() => { setTradeResult(null); x.set(0); }, 1200);
    } finally {
      setTrading(null);
    }
  };

  const handleFollow = async () => {
    if (!address || followed) return;
    await followUser(address, market.globalEventId);
    setFollowed(true);
  };

  return (
    <>
      <motion.div
        style={{ x, rotate, opacity: cardOpacity, zIndex, position: "absolute", width: "100%" }}
        drag={isTop ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        onDragEnd={handleDragEnd}
        className="swipe-card"
      >
        <div className="bg-terminal-surface border border-terminal-border rounded-2xl overflow-hidden shadow-2xl mx-auto" style={{ maxWidth: 400, minHeight: 560 }}>
          {/* Swipe overlays */}
          <motion.div
            style={{ opacity: yesOpacity }}
            className="absolute top-6 left-6 z-10 border-4 border-terminal-green rounded-lg px-4 py-2 rotate-[-12deg]"
          >
            <span className="text-terminal-green font-bold text-2xl font-mono">YES ✓</span>
          </motion.div>
          <motion.div
            style={{ opacity: noOpacity }}
            className="absolute top-6 right-6 z-10 border-4 border-terminal-red rounded-lg px-4 py-2 rotate-[12deg]"
          >
            <span className="text-terminal-red font-bold text-2xl font-mono">NO ✗</span>
          </motion.div>

          {/* Arb badge */}
          {market.hasArb && (
            <div className="absolute top-4 right-4 z-10 bg-terminal-green text-terminal-bg text-xs font-mono font-bold px-2 py-1 rounded-full">
              ARB +{((market.arbSpread ?? 0) * 100).toFixed(1)}¢
            </div>
          )}

          {/* Card content */}
          <div className="p-6 flex flex-col h-full" style={{ minHeight: 560 }}>
            {/* Platform badges */}
            <div className="flex gap-2 mb-4">
              {market.platforms.map((p) => (
                <span
                  key={p}
                  className="text-xs font-mono px-2 py-1 rounded-full uppercase font-bold"
                  style={{
                    color: PLATFORM_COLORS[p] ?? "#64748B",
                    background: `${PLATFORM_COLORS[p] ?? "#64748B"}20`,
                  }}
                >
                  {p}
                </span>
              ))}
            </div>

            {/* Question */}
            <div className="flex-1 flex items-center">
              <h2 className="text-xl font-bold text-terminal-text leading-snug">{market.question}</h2>
            </div>

            {/* Prices */}
            <div className="grid grid-cols-2 gap-3 my-6">
              <div className="bg-terminal-green/10 border border-terminal-green/30 rounded-xl p-4 text-center">
                <div className="text-terminal-green font-bold text-3xl font-mono">
                  {yesCents !== null ? `¢${yesCents}` : "—"}
                </div>
                <div className="text-xs text-terminal-muted font-mono mt-1">YES</div>
                {market.yes.bestAskPlatform && (
                  <div className="text-xs mt-1" style={{ color: PLATFORM_COLORS[market.yes.bestAskPlatform] ?? "#64748B" }}>
                    via {market.yes.bestAskPlatform}
                  </div>
                )}
              </div>
              <div className="bg-terminal-red/10 border border-terminal-red/30 rounded-xl p-4 text-center">
                <div className="text-terminal-red font-bold text-3xl font-mono">
                  {noCents !== null ? `¢${noCents}` : "—"}
                </div>
                <div className="text-xs text-terminal-muted font-mono mt-1">NO</div>
                {market.no.bestAskPlatform && (
                  <div className="text-xs mt-1" style={{ color: PLATFORM_COLORS[market.no.bestAskPlatform] ?? "#64748B" }}>
                    via {market.no.bestAskPlatform}
                  </div>
                )}
              </div>
            </div>

            {/* Swipe hint */}
            <div className="text-center mb-4">
              {isActive ? (
                <p className="text-xs text-terminal-muted font-mono">
                  <Zap className="w-3 h-3 inline text-terminal-green mr-1" />
                  Session active — swipe or tap to trade instantly
                </p>
              ) : (
                <p className="text-xs text-terminal-muted font-mono">
                  ← swipe NO · swipe YES → · or tap buttons below
                </p>
              )}
            </div>

            {/* Tap buttons (fallback / explicit) */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => handleTrade("YES")}
                disabled={!!trading || !address}
                className="py-3 rounded-xl font-mono font-bold text-sm bg-terminal-green text-terminal-bg hover:bg-terminal-green/90 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
              >
                <TrendingUp className="w-4 h-4" />
                {trading === "YES" ? "..." : "YES $10"}
              </button>
              <button
                onClick={() => handleTrade("NO")}
                disabled={!!trading || !address}
                className="py-3 rounded-xl font-mono font-bold text-sm bg-terminal-red text-white hover:bg-terminal-red/90 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
              >
                <TrendingDown className="w-4 h-4" />
                {trading === "NO" ? "..." : "NO $10"}
              </button>
            </div>

            {/* Social actions */}
            <div className="flex items-center justify-between pt-3 border-t border-terminal-border">
              <button
                onClick={() => setShowComments(true)}
                className="flex items-center gap-1.5 text-terminal-muted hover:text-terminal-text transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span className="text-xs font-mono">Comment</span>
              </button>
              <button
                onClick={handleFollow}
                className={`flex items-center gap-1.5 transition-colors ${followed ? "text-bnb" : "text-terminal-muted hover:text-bnb"}`}
              >
                <UserPlus className="w-4 h-4" />
                <span className="text-xs font-mono">{followed ? "Following" : "Follow"}</span>
              </button>
              <button className="flex items-center gap-1.5 text-terminal-muted hover:text-terminal-text transition-colors">
                <Share2 className="w-4 h-4" />
                <span className="text-xs font-mono">Share</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Trade result flash */}
      <AnimatePresence>
        {tradeResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-50 flex items-center justify-center pointer-events-none`}
          >
            <div className={`text-6xl font-bold font-mono ${tradeResult.success ? "text-terminal-green" : "text-terminal-red"}`}>
              {tradeResult.success ? (tradeResult.outcome === "YES" ? "✓ YES" : "✓ NO") : "✗ FAILED"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showComments && <CommentSheet market={market} onClose={() => setShowComments(false)} />}
    </>
  );
}
