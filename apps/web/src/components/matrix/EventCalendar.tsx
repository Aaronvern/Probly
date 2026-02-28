"use client";

import { Calendar, Clock } from "lucide-react";

interface CalendarEvent {
  id: string;
  name: string;
  date: string;       // display string e.g. "Feb 28"
  time?: string;      // e.g. "10:00 ET"
  category: "macro" | "crypto" | "policy" | "tech";
  question: string;   // predicted market question
  group: "today" | "tomorrow" | "this-week" | "next-week";
}

const CATEGORY_META: Record<CalendarEvent["category"], { label: string; dot: string; badge: string }> = {
  macro:  { label: "MACRO",    dot: "bg-yellow-400",       badge: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10" },
  crypto: { label: "CRYPTO",   dot: "bg-terminal-green",   badge: "text-terminal-green border-terminal-green/30 bg-terminal-green/10" },
  policy: { label: "POLICY",   dot: "bg-red-400",          badge: "text-red-400 border-red-400/30 bg-red-400/10" },
  tech:   { label: "TECH",     dot: "bg-blue-400",         badge: "text-blue-400 border-blue-400/30 bg-blue-400/10" },
};

const EVENTS: CalendarEvent[] = [
  // TODAY — Feb 28
  {
    id: "btc-options-expiry",
    name: "BTC Monthly Options Expiry",
    date: "Feb 28",
    time: "08:00 UTC",
    category: "crypto",
    question: "Will BTC stay above $85K at the Feb 28 options expiry?",
    group: "today",
  },
  {
    id: "bnb-hackathon-deadline",
    name: "BNB Chain Hackathon Deadline",
    date: "Feb 28",
    time: "23:59 IST",
    category: "tech",
    question: "Will Probly win a prize at the BNB Chain hackathon?",
    group: "today",
  },
  // TOMORROW — Mar 1
  {
    id: "us-jobs-report",
    name: "US Non-Farm Payrolls Report",
    date: "Mar 1",
    time: "08:30 ET",
    category: "macro",
    question: "Will US NFP beat the 185K forecast for February?",
    group: "tomorrow",
  },
  {
    id: "eth-denver",
    name: "ETH Denver 2026 Keynote",
    date: "Mar 1",
    time: "14:00 MT",
    category: "tech",
    question: "Will Ethereum announce a major L1 upgrade at ETH Denver?",
    group: "tomorrow",
  },
  {
    id: "bnb-tge",
    name: "BNB Chain Ecosystem TGE",
    date: "Mar 1",
    category: "crypto",
    question: "Will the BNB Chain ecosystem TGE project 5× at launch?",
    group: "tomorrow",
  },
  // THIS WEEK — Mar 2–7
  {
    id: "sec-crypto-hearing",
    name: "SEC Crypto Roundtable Hearing",
    date: "Mar 3",
    time: "10:00 ET",
    category: "policy",
    question: "Will the SEC signal approval of a spot ETH ETF options product?",
    group: "this-week",
  },
  {
    id: "fed-minutes",
    name: "FOMC Meeting Minutes Release",
    date: "Mar 5",
    time: "14:00 ET",
    category: "macro",
    question: "Will the Fed minutes indicate a rate cut before June 2026?",
    group: "this-week",
  },
  {
    id: "btc-dominance",
    name: "BTC Dominance Watch — 60% Level",
    date: "Mar 7",
    category: "crypto",
    question: "Will Bitcoin dominance exceed 60% by end of March 2026?",
    group: "this-week",
  },
  // NEXT WEEK — Mar 8–14
  {
    id: "us-cpi",
    name: "US CPI Inflation Data",
    date: "Mar 12",
    time: "08:30 ET",
    category: "macro",
    question: "Will US CPI come in below 3.0% for February 2026?",
    group: "next-week",
  },
  {
    id: "solana-upgrade",
    name: "Solana Firedancer Mainnet Launch",
    date: "Mar 10",
    category: "tech",
    question: "Will Solana Firedancer go live on mainnet by March 15?",
    group: "next-week",
  },
  {
    id: "bnb-greenfield",
    name: "BNB Greenfield v2 Upgrade",
    date: "Mar 11",
    category: "crypto",
    question: "Will BNB price pump >10% following the Greenfield v2 upgrade?",
    group: "next-week",
  },
];

const GROUPS: { key: CalendarEvent["group"]; label: string }[] = [
  { key: "today",     label: "TODAY — Feb 28" },
  { key: "tomorrow",  label: "TOMORROW — Mar 1" },
  { key: "this-week", label: "THIS WEEK — Mar 2–7" },
  { key: "next-week", label: "NEXT WEEK — Mar 8–14" },
];

export function EventCalendar() {
  return (
    <div className="mt-6 border border-terminal-border rounded bg-terminal-surface">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-terminal-border">
        <Calendar className="w-4 h-4 text-bnb" />
        <span className="font-mono text-sm font-bold text-terminal-text tracking-wider">EVENT CALENDAR</span>
        <span className="ml-2 text-xs font-mono text-terminal-muted">— upcoming events likely to spawn prediction markets</span>
      </div>

      <div className="divide-y divide-terminal-border">
        {GROUPS.map(({ key, label }) => {
          const events = EVENTS.filter((e) => e.group === key);
          if (events.length === 0) return null;
          return (
            <div key={key}>
              {/* Group header */}
              <div className="px-4 py-2 bg-terminal-bg/50">
                <span className="text-xs font-mono font-bold text-terminal-muted tracking-widest uppercase">
                  {label}
                </span>
              </div>

              {/* Events */}
              {events.map((ev) => {
                const meta = CATEGORY_META[ev.category];
                return (
                  <div
                    key={ev.id}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-terminal-bg/40 transition-colors group"
                  >
                    {/* Dot */}
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${meta.dot}`} />

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm text-terminal-text font-medium">{ev.name}</span>
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${meta.badge}`}>
                          {meta.label}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-terminal-muted mt-0.5 italic">
                        "{ev.question}"
                      </div>
                    </div>

                    {/* Date/time */}
                    <div className="flex-shrink-0 text-right">
                      <div className="text-xs font-mono text-terminal-text">{ev.date}</div>
                      {ev.time && (
                        <div className="flex items-center gap-1 text-[10px] font-mono text-terminal-muted justify-end mt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {ev.time}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
