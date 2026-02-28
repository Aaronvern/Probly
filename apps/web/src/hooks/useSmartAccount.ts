"use client";

import { useState, useCallback } from "react";
import { useWalletClient } from "wagmi";
import {
  createSmartAccount,
  executeTradeViaSmartAccount,
  saveSession,
  loadSession,
  clearSession,
  type SessionData,
  type TradeResult,
} from "@/lib/biconomy";

export function useSmartAccount() {
  const { data: walletClient } = useWalletClient();
  const [session, setSession] = useState<SessionData | null>(() => loadSession());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activate = useCallback(async (spendingCapUSDT = 100) => {
    if (!walletClient) return;
    setLoading(true);
    setError(null);
    try {
      const smartAccount = await createSmartAccount(walletClient);
      const smartAccountAddress = await smartAccount.getAccountAddress();

      const sessionKey = "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const data: SessionData = {
        smartAccountAddress,
        sessionKey,
        expiresAt: Date.now() + 4 * 60 * 60 * 1000, // 4 hours
        spendingCap: spendingCapUSDT,
      };

      saveSession(data);
      setSession(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [walletClient]);

  const deactivate = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const isActive = !!session && Date.now() < session.expiresAt;
  const hoursLeft = session ? Math.max(0, Math.floor((session.expiresAt - Date.now()) / 3600000)) : 0;

  /**
   * Execute a trade via Biconomy Smart Account on BSC Testnet.
   * Batches approve + executeBestTrade in one UserOp — no wallet popup.
   */
  const executeSmartTrade = useCallback(async (
    globalEventId: string,
    outcome: "YES" | "NO",
    amountUSDT = 10,
    useYield = false,
  ): Promise<TradeResult | null> => {
    if (!walletClient || !isActive) return null;
    return executeTradeViaSmartAccount(walletClient, globalEventId, outcome, amountUSDT, useYield);
  }, [walletClient, isActive]);

  return { session, isActive, hoursLeft, activate, deactivate, loading, error, executeSmartTrade };

}
