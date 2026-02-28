"use client";

import { useState, useEffect } from "react";
import { getGhostMarkets, type GhostMarket } from "@/lib/api";
import { Ghost, AlertTriangle, CheckCircle, Clock } from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  crypto:   "#F0B90B",
  politics: "#7C3AED",
  sports:   "#0EA5E9",
  finance:  "#10B981",
  tech:     "#F97316",
  other:    "#6B7280",
};

const RISK_COLORS: Record<string, string> = {
  low:      "#10B981",
  medium:   "#F0B90B",
  high:     "#F97316",
  critical: "#EF4444",
};

function RiskBadge({ level }: { level: string }) {
  const color = RISK_COLORS[level] ?? "#6B7280";
  return (
    <span
      className="text-xs font-mono font-bold px-1.5 py-0.5 rounded uppercase"
      style={{ color, border: `1px solid ${color}40`, background: `${color}10` }}
    >
      {level}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-terminal-border rounded overflow-hidden">
        <div
          className="h-full rounded"
          style={{
            width: `${pct}%`,
            background: pct >= 80 ? "#10B981" : pct >= 60 ? "#F0B90B" : "#6B7280",
          }}
        />
      </div>
      <span className="text-xs font-mono text-terminal-muted">{pct}%</span>
    </div>
  );
}

export function GhostMarketPanel() {
  const [ghosts, setGhosts] = useState<GhostMarket[]>([]);
  const [matched, setMatched] = useState<GhostMarket[]>([]);
  const [tab, setTab] = useState<"ghost" | "matched">("ghost");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [g, m] = await Promise.all([
        getGhostMarkets("ghost"),
        getGhostMarkets("matched"),
      ]);
      setGhosts(g);
      setMatched(m);
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 60_000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  const displayList = tab === "ghost" ? ghosts : matched;

  return (
    <div className="mt-8">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Ghost className="w-4 h-4 text-terminal-muted" />
          <h2 className="text-sm font-mono font-bold text-terminal-text uppercase tracking-widest">
            Ghost Markets
          </h2>
          <span className="text-xs font-mono text-terminal-muted">
            — AI-predicted markets awaiting real counterparts
          </span>
        </div>
        <div className="flex gap-2">
          {(["ghost", "matched"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded text-xs font-mono border transition-colors ${
                tab === t
                  ? "border-bnb/50 text-bnb bg-bnb/10"
                  : "border-terminal-border text-terminal-muted hover:text-terminal-text"
              }`}
            >
              {t === "ghost" ? `PENDING (${ghosts.length})` : `MATCHED (${matched.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-8 text-terminal-muted font-mono text-sm">
          Loading ghost markets...
        </div>
      ) : displayList.length === 0 ? (
        <div className="text-center py-8 text-terminal-muted font-mono text-sm border border-terminal-border rounded-lg border-dashed">
          {tab === "ghost"
            ? "No ghost markets yet — news ingestion will populate these"
            : "No matched ghost markets yet"}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {displayList.map((g) => {
            const isExpanded = expanded === g.id;
            return (
              <div
                key={g.id}
                className="border border-terminal-border rounded-lg bg-terminal-surface/30 p-4 hover:border-terminal-border/80 transition-colors cursor-pointer"
                onClick={() => setExpanded(isExpanded ? null : g.id)}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span
                    className="text-xs font-mono uppercase px-1.5 py-0.5 rounded"
                    style={{
                      color: CATEGORY_COLORS[g.category] ?? "#6B7280",
                      background: `${CATEGORY_COLORS[g.category] ?? "#6B7280"}15`,
                    }}
                  >
                    {g.category}
                  </span>
                  {g.status === "matched" ? (
                    <CheckCircle className="w-4 h-4 text-terminal-green flex-shrink-0" />
                  ) : (
                    <Ghost className="w-4 h-4 text-terminal-muted flex-shrink-0" />
                  )}
                </div>

                {/* Question */}
                <p className="text-xs text-terminal-text leading-snug mb-3 line-clamp-2">
                  {g.question}
                </p>

                {/* Meta row */}
                <div className="flex items-center justify-between">
                  <ConfidenceBar value={g.confidence} />
                  <div className="flex items-center gap-1 text-xs font-mono text-terminal-muted">
                    <Clock className="w-3 h-3" />
                    {g.resolutionDate}
                  </div>
                </div>

                {/* Resolution risk (matched only) */}
                {g.resolutionRisk && (
                  <div className="mt-2 pt-2 border-t border-terminal-border/50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-terminal-muted">Resolution Risk</span>
                      <RiskBadge level={g.resolutionRisk.level} />
                    </div>
                  </div>
                )}

                {/* Expanded details */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-terminal-border/50 space-y-2">
                    <div>
                      <span className="text-xs font-mono text-terminal-muted">Source: </span>
                      <span className="text-xs font-mono text-terminal-text">{g.resolutionSource}</span>
                    </div>
                    {g.similarityScore && (
                      <div>
                        <span className="text-xs font-mono text-terminal-muted">Match Score: </span>
                        <span className="text-xs font-mono text-terminal-green">
                          {(g.similarityScore * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {g.resolutionRisk?.reasons && g.resolutionRisk.reasons.length > 0 && (
                      <div>
                        <div className="text-xs font-mono text-terminal-muted mb-1">Risk Reasons:</div>
                        <ul className="space-y-0.5">
                          {g.resolutionRisk.reasons.map((r, i) => (
                            <li key={i} className="text-xs font-mono text-terminal-text flex items-start gap-1">
                              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: RISK_COLORS[g.resolutionRisk!.level] }} />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {g.resolutionRisk?.recommendation && (
                      <p className="text-xs font-mono text-terminal-muted italic">
                        {g.resolutionRisk.recommendation}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
