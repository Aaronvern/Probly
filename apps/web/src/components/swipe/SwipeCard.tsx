"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { useAccount } from "wagmi";
import { useSmartAccount } from "@/hooks/useSmartAccount";
import { executeTrade, type MarketPrice } from "@/lib/api";
import { Heart, MessageCircle, Share2, Bookmark, Zap, TrendingUp, TrendingDown } from "lucide-react";
import { CommentSheet } from "./CommentSheet";
import { PriceChart } from "./PriceChart";

const PLATFORM_COLORS: Record<string, string> = {
  opinion: "#F0B90B",
  predict: "#7C3AED",
  probable: "#0EA5E9",
};

function fakeChange(marketId: string, price: number): number {
  let h = 0;
  for (let i = 0; i < marketId.length; i++) h = (Math.imul(31, h) + marketId.charCodeAt(i)) | 0;
  const sign = h % 2 === 0 ? 1 : -1;
  return sign * (Math.abs(h % 8) + 1);
}

function expiresText(ts?: number): string {
  if (!ts) return "";
  const days = Math.round((ts - Date.now()) / 86400000);
  if (days < 0) return "Resolved";
  if (days === 0) return "Ends today";
  if (days < 30) return `Ends in ${days} days`;
  const months = Math.round(days / 30);
  return `Ends in ${months} month${months !== 1 ? "s" : ""}`;
}

interface SwipeCardProps {
  market: MarketPrice;
}

export function SwipeCard({ market }: SwipeCardProps) {
  const { address } = useAccount();
  const { isActive } = useSmartAccount();
  const [liked, setLiked] = useState(false);
  const [likeCount] = useState(() => Math.floor(Math.abs(hashCode(market.globalEventId)) % 200) + 5);
  const [saved, setSaved] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [trading, setTrading] = useState<"YES" | "NO" | null>(null);
  const [flash, setFlash] = useState<{ outcome: "YES" | "NO"; success: boolean } | null>(null);
  const dragStartX = useRef(0);

  const yesCents = market.yes.bestAsk !== null ? Math.round(market.yes.bestAsk * 100) : null;
  const noCents = market.no.bestAsk !== null ? Math.round(market.no.bestAsk * 100) : null;
  const yesPrice = market.yes.bestAsk ?? 0.5;
  const change = fakeChange(market.globalEventId, yesPrice);
  const expires = fakeExpiresTs(market.globalEventId);

  const handleTrade = async (outcome: "YES" | "NO") => {
    if (!address || trading) return;
    setTrading(outcome);
    try {
      const result = await executeTrade(market.globalEventId, outcome, 10);
      setFlash({ outcome, success: result.success });
    } catch {
      setFlash({ outcome, success: false });
    } finally {
      setTrading(null);
      setTimeout(() => setFlash(null), 1400);
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

  // Swipe right = save to collections
  const onTouchStart = (e: React.TouchEvent) => { dragStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - dragStartX.current;
    if (dx > 80) { setSaved(true); }
  };

  return (
    <div
      className="relative w-full h-full flex flex-col bg-terminal-bg overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Chart area — fills top ~55% */}
      <div className="relative flex-1 min-h-0">
        <PriceChart
          marketId={market.globalEventId}
          currentPrice={yesPrice}
          height={undefined}
        />

        {/* Overlay: YES price top-left, change top-right */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none">
          <div>
            <span className="text-4xl font-bold text-white font-mono">
              {yesCents !== null ? `${yesCents}¢` : "—"}
            </span>
          </div>
          <div className={`flex items-center gap-1 text-sm font-mono font-bold ${change >= 0 ? "text-terminal-green" : "text-terminal-red"}`}>
            {change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {change >= 0 ? "+" : ""}{change}¢ 24h
          </div>
        </div>

        {/* Arb badge */}
        {market.hasArb && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-terminal-green text-terminal-bg text-xs font-mono font-bold px-3 py-1 rounded-full">
            ARB +{((market.arbSpread ?? 0) * 100).toFixed(1)}¢
          </div>
        )}

        {/* Right side social actions */}
        <div className="absolute right-3 bottom-4 flex flex-col items-center gap-5 z-10">
          {/* Like */}
          <button
            onClick={() => setLiked((l) => !l)}
            className="flex flex-col items-center gap-1"
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-sm ${liked ? "bg-terminal-red/20" : "bg-black/40"}`}>
              <Heart className={`w-5 h-5 ${liked ? "fill-terminal-red text-terminal-red" : "text-white"}`} />
            </div>
            <span className="text-xs text-white font-mono">{likeCount + (liked ? 1 : 0)}</span>
          </button>

          {/* Comment */}
          <button
            onClick={() => setShowComments(true)}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <span className="text-xs text-white font-mono">Chat</span>
          </button>

          {/* Share */}
          <button
            onClick={handleShare}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
              <Share2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-xs text-white font-mono">Share</span>
          </button>

          {/* Save / Collections */}
          <button
            onClick={() => setSaved((s) => !s)}
            className="flex flex-col items-center gap-1"
          >
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
      <div className="bg-terminal-bg/95 backdrop-blur-md px-4 pt-3 pb-safe">
        {/* Platform badges */}
        <div className="flex items-center gap-2 mb-2">
          {market.platforms.map((p) => (
            <span
              key={p}
              className="text-[10px] font-mono uppercase font-bold"
              style={{ color: PLATFORM_COLORS[p] ?? "#64748B" }}
            >
              {p}
            </span>
          ))}
          <span className="text-terminal-muted text-[10px] font-mono">·</span>
          <span className="text-terminal-muted text-[10px] font-mono">{expires}</span>
          {isActive && (
            <span className="ml-auto flex items-center gap-1 text-terminal-green text-[10px] font-mono">
              <Zap className="w-3 h-3" /> 1-click on
            </span>
          )}
        </div>

        {/* Question */}
        <h2 className="text-base font-bold text-white leading-snug mb-3 line-clamp-2">
          {market.question}
        </h2>

        {/* YES / NO buttons */}
        <div className="grid grid-cols-2 gap-3 pb-2">
          <button
            onClick={() => handleTrade("YES")}
            disabled={!!trading || !address}
            className="relative py-3.5 rounded-2xl font-mono font-bold text-sm transition-all active:scale-95 disabled:opacity-50 overflow-hidden"
            style={{
              background: "rgba(0,255,136,0.1)",
              border: "1px solid rgba(0,255,136,0.3)",
              color: "#00FF88",
            }}
          >
            {trading === "YES" ? "..." : `YES ${yesCents !== null ? `${yesCents}¢` : "—"}`}
          </button>
          <button
            onClick={() => handleTrade("NO")}
            disabled={!!trading || !address}
            className="relative py-3.5 rounded-2xl font-mono font-bold text-sm transition-all active:scale-95 disabled:opacity-50 overflow-hidden"
            style={{
              background: "rgba(255,68,102,0.1)",
              border: "1px solid rgba(255,68,102,0.3)",
              color: "#FF4466",
            }}
          >
            {trading === "NO" ? "..." : `NO ${noCents !== null ? `${noCents}¢` : "—"}`}
          </button>
        </div>

        {!address && (
          <p className="text-center text-xs text-terminal-muted font-mono pb-1">
            Connect wallet to trade
          </p>
        )}
      </div>

      {/* Trade flash overlay */}
      {flash && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className={`text-5xl font-bold font-mono ${flash.success ? (flash.outcome === "YES" ? "text-terminal-green" : "text-terminal-red") : "text-terminal-muted"}`}
          >
            {flash.success ? `✓ ${flash.outcome}` : "✗ Failed"}
          </motion.div>
        </div>
      )}

      {/* Save animation overlay */}
      {saved && (
        <motion.div
          initial={{ opacity: 1, x: 0 }}
          animate={{ opacity: 0, x: 60 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50"
        >
          <Bookmark className="w-20 h-20 fill-bnb text-bnb" />
        </motion.div>
      )}

      {showComments && <CommentSheet market={market} onClose={() => setShowComments(false)} />}
    </div>
  );
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function fakeExpiresTs(marketId: string): string {
  const h = Math.abs(hashCode(marketId));
  const months = (h % 11) + 1;
  return `Ends in ${months} month${months !== 1 ? "s" : ""}`;
}
