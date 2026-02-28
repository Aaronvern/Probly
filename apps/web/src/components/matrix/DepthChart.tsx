"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const PLATFORM_COLORS: Record<string, string> = {
  opinion: "#F0B90B",
  predict: "#7C3AED",
  probable: "#0EA5E9",
};

interface Book {
  platform: string;
  bestBid: number;
  bestAsk: number;
  spread: number;
  bids: { price: number; size: number }[];
  asks: { price: number; size: number }[];
}

interface OrderbookData {
  yes: { books: Book[]; bestAsk: { price: number; platform: string } };
  no: { books: Book[]; bestAsk: { price: number; platform: string } };
  hasArb: boolean;
  arbSpread?: number;
}

interface DepthChartProps {
  globalEventId: string;
  outcome: "YES" | "NO";
}

function DepthBar({ label, bid, ask, color, maxVal }: {
  label: string;
  bid: number;
  ask: number;
  color: string;
  maxVal: number;
}) {
  const bidPct = maxVal > 0 ? (bid / maxVal) * 100 : 0;
  const askPct = maxVal > 0 ? (ask / maxVal) * 100 : 0;

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono uppercase font-bold" style={{ color }}>
          {label}
        </span>
        <div className="flex gap-3 text-[10px] font-mono text-terminal-muted">
          <span>BID <span className="text-terminal-green">¢{Math.round(bid * 100)}</span></span>
          <span>ASK <span className="text-terminal-red">¢{Math.round(ask * 100)}</span></span>
          <span>SPR <span className="text-terminal-text">¢{Math.round((ask - bid) * 100)}</span></span>
        </div>
      </div>
      <div className="flex h-4 gap-0.5">
        {/* Bid bar — grows from center left */}
        <div className="flex-1 flex justify-end items-center">
          <div
            className="h-full rounded-l transition-all duration-500"
            style={{
              width: `${bidPct}%`,
              background: `rgba(0,255,136,0.3)`,
              border: "1px solid rgba(0,255,136,0.5)",
            }}
          />
        </div>
        {/* Center divider */}
        <div className="w-px bg-terminal-border flex-shrink-0" />
        {/* Ask bar — grows from center right */}
        <div className="flex-1 flex justify-start items-center">
          <div
            className="h-full rounded-r transition-all duration-500"
            style={{
              width: `${askPct}%`,
              background: `rgba(255,68,102,0.3)`,
              border: "1px solid rgba(255,68,102,0.5)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function DepthChart({ globalEventId, outcome }: DepthChartProps) {
  const [data, setData] = useState<OrderbookData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/orderbook/${globalEventId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [globalEventId]);

  if (loading) {
    return (
      <div className="py-4 text-center text-terminal-muted font-mono text-xs animate-pulse">
        Loading depth data...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-4 text-center text-terminal-muted font-mono text-xs">
        No depth data available
      </div>
    );
  }

  const side = outcome === "YES" ? data.yes : data.no;
  const books = side.books ?? [];

  // Find max bid+ask size for normalization
  const allBids = books.map((b) => b.bestBid);
  const allAsks = books.map((b) => b.bestAsk);
  const maxVal = Math.max(...allBids, ...allAsks, 0.01);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-mono text-terminal-muted uppercase tracking-wider">
          Depth — {outcome} Side
        </span>
        {data.hasArb && (
          <span className="text-[10px] font-mono text-terminal-green font-bold">
            ARB +{((data.arbSpread ?? 0) * 100).toFixed(1)}¢ across platforms
          </span>
        )}
      </div>

      {books.length === 0 ? (
        <div className="text-center text-terminal-muted font-mono text-xs py-3">
          No orderbook data — market may be pending WS event
        </div>
      ) : (
        books.map((book) => (
          <DepthBar
            key={book.platform}
            label={book.platform}
            bid={book.bestBid}
            ask={book.bestAsk}
            color={PLATFORM_COLORS[book.platform] ?? "#64748B"}
            maxVal={maxVal}
          />
        ))
      )}

      <div className="flex justify-between text-[9px] font-mono text-terminal-muted mt-1 px-1">
        <span>← BIDS (buyers)</span>
        <span>ASKS (sellers) →</span>
      </div>
    </div>
  );
}
