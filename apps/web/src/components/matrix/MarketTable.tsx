"use client";

import { useState } from "react";
import { type MarketPrice } from "@/lib/api";
import { TradePanel } from "./TradePanel";
import { ArrowUpRight, Wifi, WifiOff, Clock } from "lucide-react";

const PLATFORM_COLORS: Record<string, string> = {
  opinion: "#F0B90B",
  predict: "#7C3AED",
  probable: "#0EA5E9",
};

function PlatformBadge({ platform }: { platform: string }) {
  const color = PLATFORM_COLORS[platform] ?? "#64748B";
  return (
    <span
      className="text-[10px] font-mono px-1.5 py-0.5 rounded uppercase"
      style={{ color, border: `1px solid ${color}30`, background: `${color}10` }}
    >
      {platform.slice(0, 3)}
    </span>
  );
}

function PriceCell({ price, platform }: { price: number | null; platform: string | null }) {
  if (price === null) return <span className="text-terminal-muted font-mono text-sm">—</span>;
  const cents = Math.round(price * 100);
  return (
    <div className="text-right">
      <span className="font-mono text-sm text-terminal-text">¢{cents}</span>
      {platform && (
        <div className="mt-0.5">
          <PlatformBadge platform={platform} />
        </div>
      )}
    </div>
  );
}

function DataSourceIcon({ source }: { source: MarketPrice["dataSource"] }) {
  if (source === "ws") return <Wifi className="w-3 h-3 text-terminal-green" title="Live WS" />;
  if (source === "rest") return <Clock className="w-3 h-3 text-terminal-muted" title="REST" />;
  return <WifiOff className="w-3 h-3 text-terminal-muted opacity-40" title="Pending" />;
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
            {f === "all" ? `ALL (${markets.length})` : f === "arb" ? `ARB (${markets.filter((m) => m.hasArb).length})` : `MULTI (${markets.filter((m) => m.platforms.length > 1).length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-terminal-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-terminal-border bg-terminal-surface">
              <th className="text-left py-2.5 px-4 text-xs font-mono text-terminal-muted uppercase tracking-wider">Market</th>
              <th className="text-left py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">Platforms</th>
              <th className="text-right py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">Best YES</th>
              <th className="text-right py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">Best NO</th>
              <th className="text-right py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider">Arb</th>
              <th className="py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider w-8"></th>
              <th className="py-2.5 px-3 text-xs font-mono text-terminal-muted uppercase tracking-wider w-8"></th>
            </tr>
          </thead>
          <tbody>
            {loading && markets.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-terminal-muted font-mono text-sm">
                  Connecting to markets...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-terminal-muted font-mono text-sm">
                  No markets match filter
                </td>
              </tr>
            ) : (
              filtered.map((market) => (
                <tr
                  key={market.globalEventId}
                  className={`border-b border-terminal-border/50 hover:bg-terminal-surface/50 cursor-pointer transition-all ${
                    market.hasArb ? "arb-row" : ""
                  }`}
                  onClick={() => setSelected(market)}
                >
                  {/* Question */}
                  <td className="py-3 px-4 max-w-xs">
                    <div className="text-xs text-terminal-text leading-snug line-clamp-2">{market.question}</div>
                  </td>

                  {/* Platforms */}
                  <td className="py-3 px-3">
                    <div className="flex gap-1 flex-wrap">
                      {market.platforms.map((p) => (
                        <PlatformBadge key={p} platform={p} />
                      ))}
                    </div>
                  </td>

                  {/* Best YES */}
                  <td className="py-3 px-3">
                    <PriceCell price={market.yes.bestAsk} platform={market.yes.bestAskPlatform} />
                  </td>

                  {/* Best NO */}
                  <td className="py-3 px-3">
                    <PriceCell price={market.no.bestAsk} platform={market.no.bestAskPlatform} />
                  </td>

                  {/* Arb */}
                  <td className="py-3 px-3 text-right">
                    {market.hasArb && market.arbSpread ? (
                      <span className="font-mono text-xs text-terminal-green font-bold">
                        +{(market.arbSpread * 100).toFixed(1)}¢
                      </span>
                    ) : (
                      <span className="text-terminal-muted font-mono text-xs">—</span>
                    )}
                  </td>

                  {/* Data source */}
                  <td className="py-3 px-3 text-center">
                    <DataSourceIcon source={market.dataSource} />
                  </td>

                  {/* Trade */}
                  <td className="py-3 px-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelected(market); }}
                      className="text-terminal-muted hover:text-bnb transition-colors"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && <TradePanel market={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
