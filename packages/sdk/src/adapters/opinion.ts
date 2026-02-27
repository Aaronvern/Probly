/**
 * Opinion Labs platform adapter
 *
 * REST: https://openapi.opinion.trade/openapi
 * WS:   wss://ws.opinion.trade?apikey={KEY}
 * SDK:  @opinion-labs/opinion-clob-sdk (viem, ESM)
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

const BASE_URL = "https://openapi.opinion.trade/openapi";

interface OpinionMarketRaw {
  marketId: number;
  marketTitle: string;
  slug: string;
  status: number;
  statusEnum: string;
  marketType: number;
  yesLabel: string;
  noLabel: string;
  yesTokenId: string;
  noTokenId: string;
  volume: string;
  chainId: string;
  createdAt: number;
  cutoffAt: number;
  resolvedAt: number;
  rules: string;
  labels: string[];
}

interface OpinionOrderbookRaw {
  market: string;
  tokenId: string;
  timestamp: string;
  bids: { price: string; size: string }[];
  asks: { price: string; size: string }[];
}

export class OpinionAdapter implements PlatformAdapter {
  readonly platform = "opinion" as const;

  constructor(
    private readonly apiKey: string,
  ) {}

  private async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), {
      headers: { apikey: this.apiKey },
    });
    if (!res.ok) throw new Error(`Opinion API ${res.status}: ${await res.text()}`);
    const json = await res.json() as any;
    if (json.errno !== 0) throw new Error(`Opinion API error: ${json.errmsg}`);
    return json.result;
  }

  async getMarkets(): Promise<UnifiedMarket[]> {
    const result = await this.fetch<{ total: number; list: OpinionMarketRaw[] }>(
      "/market",
      { pageNo: "1", pageSize: "20", status: "activated", chainId: "56" },
    );
    return result.list.map((m) => this.normalizeMarket(m));
  }

  async getOrderbook(tokenId: string): Promise<UnifiedOrderbook> {
    const raw = await this.fetch<OpinionOrderbookRaw>(
      "/token/orderbook",
      { token_id: tokenId },
    );
    const bids: PriceLevel[] = raw.bids.map((b) => ({ price: Number(b.price), size: Number(b.size) }));
    const asks: PriceLevel[] = raw.asks.map((a) => ({ price: Number(a.price), size: Number(a.size) }));
    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 1;
    return {
      platform: "opinion",
      tokenId,
      outcome: "YES", // caller determines based on token mapping
      bids,
      asks,
      bestBid,
      bestAsk,
      spread: bestAsk - bestBid,
      timestamp: Date.now(),
    };
  }

  async getPrice(tokenId: string, _side: Side): Promise<number> {
    const result = await this.fetch<{ price: string }>(
      "/token/latest-price",
      { token_id: tokenId },
    );
    return Number(result.price);
  }

  async getPositions(walletAddress: string): Promise<UnifiedPosition[]> {
    const result = await this.fetch<any[]>(
      `/positions/user/${walletAddress}`,
    );
    return result.map((p: any) => ({
      globalEventId: "",
      question: p.marketTitle ?? "",
      outcome: "YES" as Outcome,
      platform: "opinion" as const,
      tokenId: p.tokenId ?? "",
      shares: Number(p.amount ?? 0),
      avgEntryPrice: Number(p.avgPrice ?? 0),
      currentPrice: Number(p.currentPrice ?? 0),
      pnl: Number(p.pnl ?? 0),
      pnlPercent: Number(p.pnlPercent ?? 0),
    }));
  }

  private normalizeMarket(m: OpinionMarketRaw): UnifiedMarket {
    return {
      globalEventId: "",
      question: m.marketTitle,
      slug: m.slug,
      outcomes: ["YES", "NO"],
      platformIds: { opinion: String(m.marketId) },
      status: m.statusEnum === "Activated" ? "active" : m.statusEnum === "Resolved" ? "resolved" : "closed",
      resolutionSource: m.rules?.slice(0, 200),
      createdAt: m.createdAt * 1000,
      expiresAt: m.cutoffAt ? m.cutoffAt * 1000 : undefined,
      _raw: {
        yesTokenId: m.yesTokenId,
        noTokenId: m.noTokenId,
        volume: m.volume,
        labels: m.labels,
      },
    };
  }
}
