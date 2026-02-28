"use client";

import { useState } from "react";
import { type MarketPrice } from "@/lib/api";
import { TradePanel } from "./TradePanel";
import { ArrowUpRight, Wifi, WifiOff, Clock } from "lucide-react";

const PLATFORMS = ["opinion", "predict", "probable"] as const;

const PLATFORM_COLORS: Record<string, string> = {
  opinion: "#F0B90B",
  predict: "#7C3AED",
  probable: "#0EA5E9",
};

const PLATFORM_SHORT: Record<string, string> = {
  opinion: "OPN",
  predict: "PRD",
  probable: "PRB",
};

function DataSourceIcon({ source }: { source: MarketPrice["dataSource"] }) {
  if (source === "ws") return <Wifi className="w-3 h-3 text-terminal-green" title="Live WS" />;
  if (source === "rest") return <Clock className="w-3 h-3 text-terminal-muted" title="REST" />;
  return <WifiOff className="w-3 h-3 text-terminal-muted opacity-40" title="Pending" />;
}

function PriceCell({
  price,
  isBest,
  color,
}: {
  price: number | null;
  isBest?: boolean;
  color?: string;
}) {
  if (price === null)
    return <span className="text-terminal-muted font-mono text-xs">—</span>;
  const cents = Math.round(price * 100);
  return (
    <span
      className={`font-mono text-xs font-bold ${isBest ? "text-terminal-green" : "text-terminal-text"}`}
      style={isBest && color ? { color } : undefined}
    >
      ¢{cents}
    </span>
  );
}

interface MarketTableProps {
  markets: MarketPrice[];
  loading: boolean;
}

export function MarketTable({ markets, loading }: MarketTableProps) {
  const [selected, setSelected] = useState<MarketPrice | null>(null);
  const [filter, setFilter] = useState<"all" | "arb" | "multi">("all");

  const filtered = markets.filter((m) => {
    if (filter === "arb") return m.hasArb;
    if (filter === "multi") return m.platforms.length > 1;
    return true;
  });

  return (
    <>
      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-3 px-1">
        {(["all", "arb", "multi"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-xs font-mono border transition-colors ${
              filter === f
                ? "border-bnb text-bnb bg-bnb/10"
                : "border-terminal-border text-terminal-muted hover:text-terminal-text"
            }`}
          >
            {f === "all"
              ? `ALL (${markets.length})`
              : f === "arb"
              ? `ARB (${markets.filter((m) => m.hasArb).length})`
              : `MULTI (${markets.filter((m) => m.platforms.length > 1).length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-terminal-border">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="border-b border-terminal-border bg-terminal-surface">
              <th className="text-left py-2.5 px-4 text-xs font-mono text-terminal-muted uppercase tracking-wider">
                Market
              </th>
              {PLATFORMS.map((p) => (
                <th
                  key={p}
                  className="text-center py-2.5 px-2 text-xs font-mono uppercase tracking-wider"
                  style={{ color: PLATFORM_COLORS[p] }}
                >
                  {PLATFORM_SHORT[p]} YES
                </th>
              ))}
              <th className="text-center py-2.5 px-2 text-xs font-mono text-terminal-green uppercase tracking-wider">
                BEST
              </th>
              <th className="text-center py-2.5 px-2 text-xs font-mono text-terminal-muted uppercase tracking-wider">
                ARB
              </th>
              <th className="py-2.5 px-2 text-xs font-mono text-terminal-muted w-8" />
              <th className="py-2.5 px-2 text-xs font-mono text-terminal-muted w-8" />
            </tr>
          </thead>
          <tbody>
            {loading && markets.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-terminal-muted font-mono text-sm">
                  Connecting to markets...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-terminal-muted font-mono text-sm">
                  No markets match filter
                </td>
              </tr>
            ) : (
              filtered.map((market) => {
                const bestYesPlatform = market.yes.bestAskPlatform;
                return (
                  <tr
                    key={market.globalEventId}
                    className={`border-b border-terminal-border/50 hover:bg-terminal-surface/50 cursor-pointer transition-all ${
                      market.hasArb ? "arb-row" : ""
                    }`}
                    onClick={() => setSelected(market)}
                  >
                    {/* Question */}
                    <td className="py-3 px-4 max-w-xs">
                      <div className="text-xs text-terminal-text leading-snug line-clamp-2">
                        {market.question}
                      </div>
                    </td>

                    {/* Per-platform YES prices */}
                    {PLATFORMS.map((p) => {
                      const price = market.platforms.includes(p)
                        ? (market.platformPrices?.[p]?.yes ?? (bestYesPlatform === p ? market.yes.bestAsk : null))
                        : null;
                      const isBest = bestYesPlatform === p;
                      return (
                        <td key={p} className="py-3 px-2 text-center">
                          <PriceCell price={price} isBest={isBest} color={PLATFORM_COLORS[p]} />
                        </td>
                      );
                    })}

                    {/* Best YES */}
                    <td className="py-3 px-2 text-center">
                      <span className="font-mono text-xs font-bold text-terminal-green">
                        {market.yes.bestAsk !== null ? `¢${Math.round(market.yes.bestAsk * 100)}` : "—"}
                      </span>
                    </td>

                    {/* Arb */}
                    <td className="py-3 px-2 text-center">
                      {market.hasArb && market.arbSpread ? (
                        <span className="font-mono text-xs text-terminal-green font-bold">
                          +{(market.arbSpread * 100).toFixed(1)}¢
                        </span>
                      ) : (
                        <span className="text-terminal-muted font-mono text-xs">—</span>
                      )}
                    </td>

                    {/* Data source */}
                    <td className="py-3 px-2 text-center">
                      <DataSourceIcon source={market.dataSource} />
                    </td>

                    {/* Trade */}
                    <td className="py-3 px-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(market);
                        }}
                        className="text-terminal-muted hover:text-bnb transition-colors"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selected && <TradePanel market={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
