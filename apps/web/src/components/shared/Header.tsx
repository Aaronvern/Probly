"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Activity } from "lucide-react";

export function Header({ wsCount, total }: { wsCount?: number; total?: number }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-terminal-border bg-terminal-surface px-4 py-3 flex items-center justify-between sticky top-0 z-50">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-bnb font-bold text-xl tracking-tight">PROBLY</span>
          <span className="text-terminal-muted text-xs">/ BNB Prediction Hub</span>
        </div>

        {/* WS status */}
        {total !== undefined && (
          <div className="hidden sm:flex items-center gap-1.5 bg-terminal-bg border border-terminal-border rounded px-2 py-1">
            <Activity className="w-3 h-3 text-terminal-green" />
            <span className="text-xs text-terminal-muted font-mono">
              <span className="text-terminal-green">{wsCount}</span>/{total} live
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex items-center gap-1 bg-terminal-bg border border-terminal-border rounded p-1">
        <Link
          href="/"
          className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
            pathname === "/" ? "bg-bnb text-terminal-bg font-bold" : "text-terminal-muted hover:text-terminal-text"
          }`}
        >
          MATRIX
        </Link>
        <Link
          href="/swipe"
          className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
            pathname === "/swipe" ? "bg-bnb text-terminal-bg font-bold" : "text-terminal-muted hover:text-terminal-text"
          }`}
        >
          SWIPE
        </Link>
        <Link
          href="/portfolio"
          className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
            pathname === "/portfolio" ? "bg-bnb text-terminal-bg font-bold" : "text-terminal-muted hover:text-terminal-text"
          }`}
        >
          PORTFOLIO
        </Link>
      </nav>

      <ConnectButton
        accountStatus="avatar"
        chainStatus="icon"
        showBalance={false}
      />
    </header>
  );
}
