"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import { useSmartAccount } from "@/hooks/useSmartAccount";
import { executeTrade, getMarketStats, toggleLike, toggleSave, type MarketPrice } from "@/lib/api";
import { Heart, MessageCircle, Share2, Bookmark, Zap, TrendingUp, TrendingDown } from "lucide-react";
import { CommentSheet } from "./CommentSheet";
import { PriceChart } from "./PriceChart";

const PLATFORM_COLORS: Record<string, string> = {
  opinion: "#F0B90B",
  predict: "#7C3AED",
  probable: "#0EA5E9",
};

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function fakeChange(marketId: string): number {
  const h = hashCode(marketId);
  return (h % 2 === 0 ? 1 : -1) * (Math.abs(h % 8) + 1);
}

function fakeExpiry(marketId: string): string {
  const months = (Math.abs(hashCode(marketId)) % 11) + 1;
  return `Ends in ${months} month${months !== 1 ? "s" : ""}`;
}

interface SwipeCardProps {
  market: MarketPrice;
}

export function SwipeCard({ market }: SwipeCardProps) {
  const { address } = useAccount();
  const { isActive, executeSmartTrade } = useSmartAccount();

  // Real social stats from backend
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [trading, setTrading] = useState<"YES" | "NO" | null>(null);
  const [flash, setFlash] = useState<{ outcome: "YES" | "NO"; success: boolean } | null>(null);
  const dragStartX = useRef(0);

  // Fetch real stats + saved state on mount
  useEffect(() => {
    getMarketStats(market.globalEventId, address ?? undefined).then((s) => {
      setLikeCount(s.likes);
      setCommentCount(s.comments);
      setLiked(s.liked);
    }).catch(() => {});
  }, [market.globalEventId, address]);

  const yesCents = market.yes.bestAsk !== null ? Math.round(market.yes.bestAsk * 100) : null;
  const noCents = market.no.bestAsk !== null ? Math.round(market.no.bestAsk * 100) : null;
  const yesPrice = market.yes.bestAsk ?? 0.5;
  const change = fakeChange(market.globalEventId);
  const expiry = fakeExpiry(market.globalEventId);

  const handleTrade = async (outcome: "YES" | "NO") => {
    if (!address || trading) return;
    setTrading(outcome);
    try {
      if (isActive) {
        // Session active — use Biconomy Smart Account on BSC Testnet (no wallet popup)
        // Also fire backend SOR in parallel for the Opinion mainnet leg
        const [smartResult] = await Promise.allSettled([
          executeSmartTrade(market.globalEventId, outcome, 10),
          executeTrade(market.globalEventId, outcome, 10),
        ]);
        setFlash({ outcome, success: smartResult.status === "fulfilled" && !!smartResult.value });
      } else {
        // No session — standard backend SOR execution
        const result = await executeTrade(market.globalEventId, outcome, 10);
        setFlash({ outcome, success: result.success });
      }
    } catch {
      setFlash({ outcome, success: false });
    } finally {
      setTrading(null);
      setTimeout(() => setFlash(null), 1400);
    }
  };

  const handleLike = async () => {
    if (!address) return;
    // Optimistic update
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((c) => c + (wasLiked ? -1 : 1));
    try {
      const res = await toggleLike(market.globalEventId, address);
      setLiked(res.liked);
      setLikeCount((c) => c + (res.liked === !wasLiked ? 0 : res.liked ? 1 : -1));
    } catch {
      // Revert on error
      setLiked(wasLiked);
      setLikeCount((c) => c + (wasLiked ? 1 : -1));
    }
  };

  const handleShare = async () => {
    const text = `${market.question} — YES ¢${yesCents} on Probly`;
    if (navigator.share) {
      await navigator.share({ title: "Probly", text, url: window.location.href }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  const handleSave = async () => {
    if (!address) return;
    const wasSaved = saved;
    setSaved(!wasSaved);
    try {
      const res = await toggleSave(market.globalEventId, address);
      setSaved(res.saved);
    } catch {
      setSaved(wasSaved);
    }
  };

  // Swipe right = save to collections
  const onTouchStart = (e: React.TouchEvent) => { dragStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - dragStartX.current;
    if (dx > 80) handleSave();
  };

  return (
    <div
      className="relative w-full h-full flex flex-col bg-terminal-bg overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Spacer so chart doesn't bleed behind floating header (~56px) */}
      <div className="h-14 flex-shrink-0" />

      {/* Price + change row — sits below header */}
      <div className="flex justify-between items-baseline px-4 pb-1 flex-shrink-0">
        <span className="text-4xl font-bold text-white font-mono">
          {yesCents !== null ? `${yesCents}¢` : "—"}
        </span>
        <span className={`flex items-center gap-1 text-sm font-mono font-bold ${change >= 0 ? "text-terminal-green" : "text-terminal-red"}`}>
          {change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          {change >= 0 ? "+" : ""}{change}¢ 24h
        </span>
      </div>

      {/* Arb badge */}
      {market.hasArb && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 bg-terminal-green text-terminal-bg text-xs font-mono font-bold px-3 py-1 rounded-full">
          ARB +{((market.arbSpread ?? 0) * 100).toFixed(1)}¢
        </div>
      )}

      {/* Chart — fills remaining space above bottom panel */}
      <div className="flex-1 min-h-0 relative">
        <PriceChart
          marketId={market.globalEventId}
          currentPrice={yesPrice}
          height="100%"
        />

        {/* Right side social actions — overlaid on chart */}
        <div className="absolute right-3 bottom-3 flex flex-col items-center gap-5 z-10">
          <button onClick={handleLike} className="flex flex-col items-center gap-1">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-sm ${liked ? "bg-terminal-red/20" : "bg-black/40"}`}>
              <Heart className={`w-5 h-5 ${liked ? "fill-terminal-red text-terminal-red" : "text-white"}`} />
            </div>
            <span className="text-xs text-white font-mono">{likeCount}</span>
          </button>

          <button onClick={() => setShowComments(true)} className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <span className="text-xs text-white font-mono">{commentCount}</span>
          </button>

          <button onClick={handleShare} className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
              <Share2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-xs text-white font-mono">Share</span>
          </button>

          <button onClick={handleSave} className="flex flex-col items-center gap-1">
            <div className={`w-10 h-10 rounded-full backdrop-blur-sm flex items-center justify-center ${saved ? "bg-bnb/20" : "bg-black/40"}`}>
              <Bookmark className={`w-5 h-5 ${saved ? "fill-bnb text-bnb" : "text-white"}`} />
            </div>
            <span className={`text-xs font-mono ${saved ? "text-bnb" : "text-white"}`}>
              {saved ? "Saved" : "Save"}
            </span>
          </button>
        </div>
      </div>

      {/* Bottom info panel */}
      <div className="flex-shrink-0 bg-terminal-bg px-4 pt-3 pb-safe">
        <div className="flex items-center gap-2 mb-2">
          {market.platforms.map((p) => (
            <span key={p} className="text-[10px] font-mono uppercase font-bold" style={{ color: PLATFORM_COLORS[p] ?? "#64748B" }}>
              {p}
            </span>
          ))}
          <span className="text-terminal-muted text-[10px] font-mono">· {expiry}</span>
          {isActive && (
            <span className="ml-auto flex items-center gap-1 text-terminal-green text-[10px] font-mono">
              <Zap className="w-3 h-3" /> 1-click
            </span>
          )}
        </div>

        <h2 className="text-base font-bold text-white leading-snug mb-3 line-clamp-2">
          {market.question}
        </h2>

        <div className="grid grid-cols-2 gap-3 pb-1">
          <button
            onClick={() => handleTrade("YES")}
            disabled={!!trading || !address}
            className="py-3.5 rounded-2xl font-mono font-bold text-sm transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "rgba(0,255,136,0.1)", border: "1px solid rgba(0,255,136,0.3)", color: "#00FF88" }}
          >
            {trading === "YES" ? "..." : `YES ${yesCents !== null ? `${yesCents}¢` : "—"}`}
          </button>
          <button
            onClick={() => handleTrade("NO")}
            disabled={!!trading || !address}
            className="py-3.5 rounded-2xl font-mono font-bold text-sm transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "rgba(255,68,102,0.1)", border: "1px solid rgba(255,68,102,0.3)", color: "#FF4466" }}
          >
            {trading === "NO" ? "..." : `NO ${noCents !== null ? `${noCents}¢` : "—"}`}
          </button>
        </div>

        {!address && (
          <p className="text-center text-xs text-terminal-muted font-mono pt-1">
            Connect wallet to trade
          </p>
        )}
      </div>

      {/* Trade flash */}
      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
          >
            <span className={`text-5xl font-bold font-mono ${flash.success ? (flash.outcome === "YES" ? "text-terminal-green" : "text-terminal-red") : "text-terminal-muted"}`}>
              {flash.success ? `✓ ${flash.outcome}` : "✗ Failed"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {showComments && (
        <CommentSheet
          market={market}
          onClose={() => {
            setShowComments(false);
            // Refresh comment count after closing
            getMarketStats(market.globalEventId, address ?? undefined)
              .then((s) => setCommentCount(s.comments))
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
