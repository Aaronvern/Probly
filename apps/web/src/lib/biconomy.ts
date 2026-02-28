"use client";

import { createSmartAccountClient, type BiconomySmartAccountV2 } from "@biconomy/account";
import { encodeFunctionData } from "viem";
import type { WalletClient } from "viem";

// BSC Mainnet — smart account creation
const BUNDLER_URL_MAINNET = `https://bundler.biconomy.io/api/v2/56/${process.env.NEXT_PUBLIC_BICONOMY_API_KEY}`;
const PAYMASTER_URL_MAINNET = `https://paymaster.biconomy.io/api/v1/56/${process.env.NEXT_PUBLIC_BICONOMY_API_KEY}`;

// BSC Testnet — trade execution (contracts deployed here)
const BUNDLER_URL_TESTNET = `https://bundler.biconomy.io/api/v2/97/${process.env.NEXT_PUBLIC_BICONOMY_API_KEY}`;
const PAYMASTER_URL_TESTNET = `https://paymaster.biconomy.io/api/v1/97/${process.env.NEXT_PUBLIC_BICONOMY_API_KEY}`;

// Deployed contract addresses (BSC Testnet)
const AGGREGATOR_ROUTER = "0xbc4cBD176eAa33223c3EF93Ed4b2844C5627506F" as const;
const MOCK_USDT = "0x701420BA9Cfad65Ca95a1A05515b893018ea4aeD" as const;

// Minimal ABIs
const ERC20_APPROVE_ABI = [{
  name: "approve",
  type: "function",
  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ type: "bool" }],
  stateMutability: "nonpayable",
}] as const;

const ROUTER_ABI = [{
  name: "executeBestTrade",
  type: "function",
  inputs: [
    { name: "marketId", type: "uint256" },
    { name: "outcome", type: "uint8" },
    { name: "usdtAmount", type: "uint256" },
    { name: "minShares", type: "uint256" },
    { name: "venue", type: "uint8" },
    { name: "useYield", type: "bool" },
  ],
  outputs: [{ name: "sharesOut", type: "uint256" }],
  stateMutability: "nonpayable",
}] as const;

/** Derive a stable uint256 marketId from a globalEventId string */
function toMarketId(globalEventId: string): bigint {
  let h = 0;
  for (let i = 0; i < globalEventId.length; i++) {
    h = (Math.imul(31, h) + globalEventId.charCodeAt(i)) | 0;
  }
  return BigInt(Math.abs(h));
}

export async function createSmartAccount(walletClient: WalletClient): Promise<BiconomySmartAccountV2> {
  const smartAccount = await createSmartAccountClient({
    signer: walletClient as any,
    bundlerUrl: BUNDLER_URL_MAINNET,
    paymasterUrl: PAYMASTER_URL_MAINNET,
    rpcUrl: "https://bsc-dataseed.binance.org",
    chainId: 56,
  });
  return smartAccount;
}

export interface TradeResult {
  userOpHash: string;
  txHash?: string;
}

/**
 * Execute a trade via Biconomy Smart Account on BSC Testnet.
 * Batches: MockUSDT.approve(router, amount) + AggregatorRouter.executeBestTrade(...)
 * in a single UserOperation — no MetaMask popup needed when session is active.
 */
export async function executeTradeViaSmartAccount(
  walletClient: WalletClient,
  globalEventId: string,
  outcome: "YES" | "NO",
  amountUSDT = 10,
): Promise<TradeResult> {
  const smartAccount = await createSmartAccountClient({
    signer: walletClient as any,
    bundlerUrl: BUNDLER_URL_TESTNET,
    paymasterUrl: PAYMASTER_URL_TESTNET,
    rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
    chainId: 97,
  });

  const usdtAmount = BigInt(amountUSDT) * BigInt(1_000_000); // 6 decimals
  const marketId = toMarketId(globalEventId);
  const outcomeNum = outcome === "YES" ? 0 : 1;

  // Batch: approve + executeBestTrade in one UserOp
  const userOpResponse = await smartAccount.sendTransaction([
    {
      to: MOCK_USDT,
      data: encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [AGGREGATOR_ROUTER, usdtAmount],
      }),
    },
    {
      to: AGGREGATOR_ROUTER,
      data: encodeFunctionData({
        abi: ROUTER_ABI,
        functionName: "executeBestTrade",
        args: [
          marketId,
          outcomeNum,
          usdtAmount,
          BigInt(0), // minShares — no slippage protection for demo
          0,        // Venue.PREDICT
          false,    // useYield
        ],
      }),
    },
  ]);

  const receipt = await userOpResponse.wait();
  return {
    userOpHash: userOpResponse.userOpHash,
    txHash: receipt?.receipt?.transactionHash,
  };
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
