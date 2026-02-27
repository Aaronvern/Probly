/**
 * Predict.fun platform adapter
 *
 * REST: https://api.predict.fun
 * WS:   wss://ws.predict.fun/ws
 * SDK:  @predictdotfun/sdk (ethers v6)
 */

import type {
  PlatformAdapter,
  UnifiedMarket,
  UnifiedOrderbook,
  UnifiedPosition,
  Side,
  Outcome,
  PriceLevel,
} from "../types.js";

const BASE_URL = "https://api.predict.fun";

interface PredictMarketRaw {
  id: number;
  title: string;
  question: string;
  description: string;
  imageUrl: string;
  tradingStatus: string;
  status: string;
  conditionId: string;
  categorySlug: string;
  createdAt: string;
  outcomes: { name: string; indexSet: number; onChainId: string; status?: string }[];
  feeRateBps: number;
}

interface PredictOrderbookRaw {
  bids: { price: string; size: string }[];
  asks: { price: string; size: string }[];
}

export class PredictAdapter implements PlatformAdapter {
  readonly platform = "predict" as const;

  constructor(
    private readonly apiKey: string,
  ) {}

  private async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), {
      headers: { "x-api-key": this.apiKey },
    });
    if (!res.ok) throw new Error(`Predict API ${res.status}: ${await res.text()}`);
    const json = await res.json() as any;
    if (json.success === false) throw new Error(`Predict API error: ${json.message}`);
    return json.data ?? json;
  }

  async getMarkets(): Promise<UnifiedMarket[]> {
    const result = await this.fetch<PredictMarketRaw[]>("/v1/markets", { limit: "20" });
    return result.map((m) => this.normalizeMarket(m));
  }

  async getOrderbook(tokenId: string): Promise<UnifiedOrderbook> {
    // Predict uses market ID for orderbook, not tokenId directly
    const raw = await this.fetch<PredictOrderbookRaw>(
      `/v1/markets/${tokenId}/orderbook`,
    );
    const bids: PriceLevel[] = (raw.bids ?? []).map((b) => ({ price: Number(b.price), size: Number(b.size) }));
    const asks: PriceLevel[] = (raw.asks ?? []).map((a) => ({ price: Number(a.price), size: Number(a.size) }));
    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 1;
    return {
      platform: "predict",
      tokenId,
      outcome: "YES",
      bids,
      asks,
      bestBid,
      bestAsk,
      spread: bestAsk - bestBid,
      timestamp: Date.now(),
    };
  }

  async getPrice(tokenId: string, _side: Side): Promise<number> {
    const result = await this.fetch<any>(`/v1/markets/${tokenId}/last-sale`);
    return Number(result.price ?? 0);
  }

  async getPositions(walletAddress: string): Promise<UnifiedPosition[]> {
    const result = await this.fetch<any[]>(`/v1/positions/${walletAddress}`);
    return (result ?? []).map((p: any) => ({
      globalEventId: "",
      question: p.title ?? "",
      outcome: (p.outcomeName ?? "YES") as Outcome,
      platform: "predict" as const,
      tokenId: p.tokenId ?? String(p.marketId ?? ""),
      shares: Number(p.size ?? 0),
      avgEntryPrice: Number(p.avgPrice ?? 0),
      currentPrice: Number(p.currentPrice ?? 0),
      pnl: Number(p.pnl ?? 0),
      pnlPercent: Number(p.pnlPercent ?? 0),
    }));
  }

  private normalizeMarket(m: PredictMarketRaw): UnifiedMarket {
    const outcomes: Outcome[] = m.outcomes?.length === 2
      ? ["YES", "NO"]
      : ["YES", "NO"];
    return {
      globalEventId: "",
      question: m.question || m.title,
      slug: m.categorySlug,
      outcomes,
      platformIds: { predict: String(m.id) },
      status: m.tradingStatus === "ACTIVE" ? "active" : m.status === "RESOLVED" ? "resolved" : "closed",
      resolutionSource: m.description?.slice(0, 200),
      createdAt: new Date(m.createdAt).getTime(),
      _raw: {
        conditionId: m.conditionId,
        outcomeTokens: m.outcomes?.map((o) => ({ name: o.name, onChainId: o.onChainId })),
        feeRateBps: m.feeRateBps,
      },
    };
  }
}
