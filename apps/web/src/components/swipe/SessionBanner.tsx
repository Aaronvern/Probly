"use client";

import { useSmartAccount } from "@/hooks/useSmartAccount";
import { useAccount } from "wagmi";
import { Zap, Shield, X } from "lucide-react";

export function SessionBanner() {
  const { address } = useAccount();
  const { session, isActive, hoursLeft, activate, deactivate, loading } = useSmartAccount();

  if (!address) return null;

  if (isActive && session) {
    return (
      <div className="bg-terminal-green/10 border border-terminal-green/30 rounded-lg p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-terminal-green" />
          <div>
            <div className="text-xs font-mono text-terminal-green font-bold">SESSION ACTIVE</div>
            <div className="text-xs font-mono text-terminal-muted">
              {session.smartAccountAddress.slice(0, 10)}... · {hoursLeft}h left · cap ${session.spendingCap}
            </div>
          </div>
        </div>
        <button onClick={deactivate} className="text-terminal-muted hover:text-terminal-red transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-4 h-4 text-bnb" />
        <span className="text-sm font-mono font-bold text-terminal-text">Enable 1-Click Trading</span>
      </div>
      <p className="text-xs text-terminal-muted font-mono mb-3">
        Sign once → trade for 4 hours with no more wallet popups. Powered by Biconomy Smart Accounts.
      </p>
      <button
        onClick={() => activate(100)}
        disabled={loading}
        className="w-full py-2 rounded font-mono text-sm font-bold bg-bnb text-terminal-bg hover:bg-bnb-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Zap className="w-4 h-4" />
        {loading ? "CREATING SESSION..." : "ACTIVATE SESSION KEY"}
      </button>
    </div>
  );
}
