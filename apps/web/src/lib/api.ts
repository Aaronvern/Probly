const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface MarketPrice {
  globalEventId: string;
  question: string;
  platforms: string[];
  yes: { bestAsk: number | null; bestAskPlatform: string | null };
  no: { bestAsk: number | null; bestAskPlatform: string | null };
  hasArb: boolean;
  arbSpread?: number;
  dataSource: "ws" | "rest" | "pending" | "none";
}

export interface PricesResponse {
  count: number;
  updatedAt: number;
  markets: MarketPrice[];
}

export interface QuoteResponse {
  globalEventId: string;
  question: string;
  intent: { outcome: string; side: string; amount: number };
  route: {
    legs: { platform: string; amount: number; allocationPct: number; expectedPrice: number; expectedShares: number }[];
    totalCost: number;
    weightedAvgPrice: number;
    estimatedShares: number;
    platformCount: number;
  };
}

export interface Comment {
  _id: string;
  marketId: string;
  author: string;
  authorAddress: string;
  text: string;
  createdAt: number;
}

export async function getPrices(): Promise<PricesResponse> {
  const res = await fetch(`${API}/api/prices`);
  if (!res.ok) throw new Error("Failed to fetch prices");
  return res.json();
}

export async function getQuote(
  globalEventId: string,
  outcome: "YES" | "NO",
  amount: number,
): Promise<QuoteResponse> {
  const res = await fetch(`${API}/api/trade/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ globalEventId, outcome, side: "BUY", amount }),
  });
  if (!res.ok) throw new Error("Failed to get quote");
  return res.json();
}

export async function executeTrade(
  globalEventId: string,
  outcome: "YES" | "NO",
  amount: number,
  maxSlippage = 0.05,
) {
  const res = await fetch(`${API}/api/trade/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ globalEventId, outcome, side: "BUY", amount, maxSlippage }),
  });
  if (!res.ok) throw new Error("Failed to execute trade");
  return res.json();
}

export async function getComments(marketId: string): Promise<Comment[]> {
  const res = await fetch(`${API}/api/social/comments/${marketId}`);
  if (!res.ok) return [];
  return res.json();
}

export async function postComment(marketId: string, text: string, authorAddress: string) {
  const res = await fetch(`${API}/api/social/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marketId, text, authorAddress, author: authorAddress.slice(0, 6) + "..." + authorAddress.slice(-4) }),
  });
  if (!res.ok) throw new Error("Failed to post comment");
  return res.json();
}

export async function followUser(followerAddress: string, targetAddress: string) {
  const res = await fetch(`${API}/api/social/follow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ followerAddress, targetAddress }),
  });
  return res.json();
}

export async function getFollowing(address: string): Promise<string[]> {
  const res = await fetch(`${API}/api/social/following/${address}`);
  if (!res.ok) return [];
  return res.json();
}
