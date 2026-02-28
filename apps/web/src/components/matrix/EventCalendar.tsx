"use client";

import { useEffect, useState } from "react";
import { Calendar, Clock, ExternalLink } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface GhostEvent {
  id: string;
  question: string;
  category: string;
  confidence: number | null;
  resolutionDate: string | null;
  resolutionSource: string | null;
  createdAt: number;
}

const CATEGORY_META: Record<string, { label: string; dot: string; badge: string }> = {
  crypto:   { label: "CRYPTO",   dot: "bg-terminal-green", badge: "text-terminal-green border-terminal-green/30 bg-terminal-green/10" },
  finance:  { label: "MACRO",    dot: "bg-yellow-400",     badge: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10" },
  politics: { label: "POLICY",   dot: "bg-red-400",        badge: "text-red-400 border-red-400/30 bg-red-400/10" },
  tech:     { label: "TECH",     dot: "bg-blue-400",       badge: "text-blue-400 border-blue-400/30 bg-blue-400/10" },
  sports:   { label: "SPORTS",   dot: "bg-purple-400",     badge: "text-purple-400 border-purple-400/30 bg-purple-400/10" },
  other:    { label: "OTHER",    dot: "bg-terminal-muted", badge: "text-terminal-muted border-terminal-muted/30 bg-terminal-muted/10" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "bg-terminal-green" : pct >= 60 ? "bg-yellow-400" : "bg-terminal-muted";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1 bg-terminal-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-terminal-muted">{pct}%</span>
    </div>
  );
}

export function EventCalendar() {
  const [events, setEvents] = useState<GhostEvent[]>([]);
  const [source, setSource] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/events?limit=100`)
      .then((r) => r.json())
      .then((d) => {
        setEvents(d.events ?? []);
        setSource(d.source ?? "");
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mt-6 border border-terminal-border rounded bg-terminal-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-bnb" />
          <span className="font-mono text-sm font-bold text-terminal-text tracking-wider">EVENT CALENDAR</span>
          {source === "ghost_markets" && (
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border text-bnb border-bnb/30 bg-bnb/10 ml-1">AI</span>
          )}
          <span className="ml-1 text-xs font-mono text-terminal-muted hidden sm:inline">
            — {source === "ghost_markets" ? "LLM-predicted markets from live news" : "news events likely to spawn prediction markets"}
          </span>
        </div>
        {!loading && (
          <span className="text-xs font-mono text-terminal-muted">{events.length} events</span>
        )}
      </div>

      {/* Body */}
      {loading && (
        <div className="px-4 py-8 text-center text-xs font-mono text-terminal-muted animate-pulse">
          Loading events...
        </div>
      )}
      {error && (
        <div className="px-4 py-4 text-xs font-mono text-red-400">Failed to load — {error}</div>
      )}
      {!loading && !error && events.length === 0 && (
        <div className="px-4 py-8 text-center text-xs font-mono text-terminal-muted">
          No events yet — news ingester will populate shortly.
        </div>
      )}

      {!loading && events.length > 0 && (
        <div className="divide-y divide-terminal-border">
          {events.map((ev) => {
            const meta = CATEGORY_META[ev.category] ?? CATEGORY_META["other"];
            return (
              <div key={ev.id} className="flex items-start gap-3 px-4 py-3 hover:bg-terminal-bg/40 transition-colors">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${meta.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm text-terminal-text">{ev.question}</span>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${meta.badge}`}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {ev.confidence !== null && <ConfidenceBar value={ev.confidence} />}
                    {ev.resolutionSource && (
                      <span className="text-[10px] font-mono text-terminal-muted">via {ev.resolutionSource}</span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  {ev.resolutionDate && (
                    <div className="text-xs font-mono text-terminal-text">{formatDate(ev.resolutionDate)}</div>
                  )}
                  <div className="flex items-center gap-1 text-[10px] font-mono text-terminal-muted justify-end mt-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    {new Date(ev.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
