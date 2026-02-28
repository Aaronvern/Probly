/**
 * Probable Markets platform adapter
 *
 * REST: https://market-api.probable.markets/public/api/v1
 * WS:   wss://api.probable.markets/ws?chainId=56
 * SDK:  @prob/clob (viem)
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

const PUBLIC_BASE = "https://market-api.probable.markets/public/api/v1";
const CLOB_BASE = "https://api.probable.markets/public/api/v1";

interface ProbableEventRaw {
  id: string;
  slug: string;
  title: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  liquidity: string;
  volume: string;
  createdAt: string;
  markets: ProbableMarketRaw[];
  tags: { id: number; label: string; slug: string }[];
}

interface ProbableMarketRaw {
  id: string;
  condition_id: string;
  question: string;
  question_id: string;
  market_slug: string;
  outcomes: string; // JSON string: '["Yes","No"]'
  clobTokenIds: string; // JSON string
  active: boolean;
  closed: boolean;
  startDate: string;
  endDate: string;
  tokens: { token_id: string; outcome: string }[];
  description: string;
  volume24hr: string;
  liquidity: string;
}

interface ProbableOrderbookRaw {
  bids: { price: string; size: string }[];
  asks: { price: string; size: string }[];
}

export class ProbableAdapter implements PlatformAdapter {
  readonly platform = "probable" as const;

  constructor() {}

  private async fetchPublic<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${PUBLIC_BASE}/${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Probable API ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  private async fetchClob<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${CLOB_BASE}/${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Probable CLOB ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async getMarkets(): Promise<UnifiedMarket[]> {
    const events = await this.fetchPublic<ProbableEventRaw[]>("events", {
      page: "1",
      limit: "100",
      status: "active",
    });
    return events.flatMap((e) => this.normalizeEvent(e));
  }

  async getOrderbook(tokenId: string): Promise<UnifiedOrderbook> {
    const raw = await this.fetchClob<ProbableOrderbookRaw>("book", {
      token_id: tokenId,
    });
    const bids: PriceLevel[] = (raw.bids ?? []).map((b) => ({ price: Number(b.price), size: Number(b.size) }));
    const asks: PriceLevel[] = (raw.asks ?? []).map((a) => ({ price: Number(a.price), size: Number(a.size) }));
    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 1;
    return {
      platform: "probable",
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

  async getPrice(tokenId: string, side: Side): Promise<number> {
    const result = await this.fetchClob<{ price: string }>("price", {
      token_id: tokenId,
      side: side,
    });
    return Number(result.price ?? 0);
  }

  async getPositions(_walletAddress: string): Promise<UnifiedPosition[]> {
    // Positions require L2 auth — skip for now, return empty
    return [];
  }

  private normalizeEvent(e: ProbableEventRaw): UnifiedMarket[] {
    return e.markets.map((m) => {
      const outcomeNames: string[] = JSON.parse(m.outcomes || '["Yes","No"]');
      return {
        globalEventId: "",
        question: m.question || e.title,
        slug: m.market_slug || e.slug,
        outcomes: ["YES", "NO"] as Outcome[],
        platformIds: { probable: m.id },
        status: m.active ? "active" : m.closed ? "closed" : "closed",
        resolutionSource: m.description?.slice(0, 200),
        createdAt: new Date(e.createdAt).getTime(),
        expiresAt: m.endDate ? new Date(m.endDate).getTime() : undefined,
        _raw: {
          eventId: e.id,
          conditionId: m.condition_id,
          tokens: m.tokens,
          outcomeNames,
          volume: m.volume24hr,
          liquidity: m.liquidity,
          tags: e.tags.map((t) => t.label),
        },
      };
    });
  }
}
