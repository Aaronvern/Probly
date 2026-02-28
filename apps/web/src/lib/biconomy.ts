"use client";

import { createSmartAccountClient, type BiconomySmartAccountV2 } from "@biconomy/account";
import type { WalletClient } from "viem";

const BUNDLER_URL = `https://bundler.biconomy.io/api/v2/56/${process.env.NEXT_PUBLIC_BICONOMY_API_KEY}`;

export async function createSmartAccount(walletClient: WalletClient): Promise<BiconomySmartAccountV2> {
  const smartAccount = await createSmartAccountClient({
    signer: walletClient as any,
    bundlerUrl: BUNDLER_URL,
    paymasterUrl: `https://paymaster.biconomy.io/api/v1/56/${process.env.NEXT_PUBLIC_BICONOMY_API_KEY}`,
    rpcUrl: "https://bsc-dataseed.binance.org",
    chainId: 56,
  });
  return smartAccount;
}

export interface SessionData {
  smartAccountAddress: string;
  sessionKey: string;
  expiresAt: number;
  spendingCap: number;
}

const SESSION_STORAGE_KEY = "probly_session";

export function saveSession(data: SessionData) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
}

export function loadSession(): SessionData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SessionData;
    if (Date.now() > data.expiresAt) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_STORAGE_KEY);
}
