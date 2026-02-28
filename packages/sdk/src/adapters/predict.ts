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
  marketId: number;
  // [price, quantity] tuples, YES outcome only
  bids: [number, number][];
  asks: [number, number][];
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
    const result = await this.fetch<PredictMarketRaw[]>("/v1/markets", {
      first: "100",
      status: "OPEN",
    });
    return result.map((m) => this.normalizeMarket(m));
  }

  async getOrderbook(marketId: string): Promise<UnifiedOrderbook> {
    // marketId is the numeric market ID; Predict has a single YES-only orderbook per market
    const raw = await this.fetch<PredictOrderbookRaw>(
      `/v1/markets/${marketId}/orderbook`,
    );
    // Response: bids/asks are [price, quantity] tuples
    const bids: PriceLevel[] = (raw.bids ?? []).map(([price, size]) => ({ price, size }));
    const asks: PriceLevel[] = (raw.asks ?? []).map(([price, size]) => ({ price, size }));
    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 1;
    return {
      platform: "predict",
      tokenId: marketId,
      outcome: "YES",
      bids,
      asks,
      bestBid,
      bestAsk,
      spread: bestAsk - bestBid,
      timestamp: Date.now(),
    };
  }

  async getPrice(marketId: string, side: Side): Promise<number> {
    // Derive price from orderbook — more reliable than last-sale which can be stale/empty
    const book = await this.getOrderbook(marketId);
    return side === "BUY" ? book.bestAsk : book.bestBid;
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
      status: m.tradingStatus === "OPEN" ? "active" : m.status === "RESOLVED" ? "resolved" : "closed",
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
