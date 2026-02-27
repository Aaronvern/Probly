"use client";

import { useState, useCallback } from "react";
import { useWalletClient } from "wagmi";
import { createSmartAccount, saveSession, loadSession, clearSession, type SessionData } from "@/lib/biconomy";

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

      // Generate a random session key (ephemeral private key)
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

  return { session, isActive, hoursLeft, activate, deactivate, loading, error };
}
