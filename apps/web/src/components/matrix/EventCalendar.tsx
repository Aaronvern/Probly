"use client";

import { useEffect, useState } from "react";
import { Calendar, Clock, ExternalLink } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface NewsEvent {
  id: string;
  headline: string;
  source: string;
  category: string;
  url: string;
  fetchedAt: number;
}

const CATEGORY_META: Record<string, { label: string; dot: string; badge: string }> = {
  crypto:   { label: "CRYPTO",   dot: "bg-terminal-green", badge: "text-terminal-green border-terminal-green/30 bg-terminal-green/10" },
  finance:  { label: "MACRO",    dot: "bg-yellow-400",     badge: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10" },
  politics: { label: "POLICY",   dot: "bg-red-400",        badge: "text-red-400 border-red-400/30 bg-red-400/10" },
  tech:     { label: "TECH",     dot: "bg-blue-400",       badge: "text-blue-400 border-blue-400/30 bg-blue-400/10" },
  sports:   { label: "SPORTS",   dot: "bg-purple-400",     badge: "text-purple-400 border-purple-400/30 bg-purple-400/10" },
};

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function EventCalendar() {
  const [events, setEvents] = useState<NewsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/events?limit=30`)
      .then((r) => r.json())
      .then((d) => {
        setEvents(d.events ?? []);
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
          <span className="ml-2 text-xs font-mono text-terminal-muted hidden sm:inline">— news events likely to spawn prediction markets</span>
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
        <div className="px-4 py-4 text-xs font-mono text-red-400">
          Failed to load events — {error}
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="px-4 py-8 text-center text-xs font-mono text-terminal-muted">
          No event-related articles found. News ingester will populate shortly.
        </div>
      )}

      {!loading && events.length > 0 && (
        <div className="divide-y divide-terminal-border">
          {events.map((ev) => {
            const meta = CATEGORY_META[ev.category] ?? CATEGORY_META["tech"];
            return (
              <div
                key={ev.id}
                className="flex items-start gap-3 px-4 py-3 hover:bg-terminal-bg/40 transition-colors"
              >
                {/* Dot */}
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${meta.dot}`} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm text-terminal-text">{ev.headline}</span>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${meta.badge}`}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-terminal-muted mt-0.5">
                    {ev.source}
                  </div>
                </div>

                {/* Right side */}
                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1 text-[10px] font-mono text-terminal-muted">
                    <Clock className="w-2.5 h-2.5" />
                    {timeAgo(ev.fetchedAt)}
                  </div>
                  <a
                    href={ev.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-terminal-muted hover:text-bnb transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
