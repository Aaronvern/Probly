/**
 * Unified types for the Prism prediction market aggregator.
 * All platform adapters normalize to these types.
 */

export type Side = "BUY" | "SELL";
export type Outcome = "YES" | "NO";

/** Normalized market representation across all platforms */
export interface UnifiedMarket {
  globalEventId: string;
  question: string;
  slug: string;
  outcomes: Outcome[];
  /** Platform-specific market identifiers */
  platformIds: {
    opinion?: string;
    predict?: string;
    probable?: string;
  };
  status: "active" | "closed" | "resolved";
  resolutionSource?: string;
  createdAt: number;
  expiresAt?: number;
  /** Platform-specific raw data for debugging / advanced use */
  _raw?: Record<string, any>;
}

/** Normalized orderbook entry */
export interface PriceLevel {
  price: number; // 0.001 - 0.999
  size: number; // Number of shares available
}

/** Normalized orderbook from any platform */
export interface UnifiedOrderbook {
  platform: Platform;
  tokenId: string;
  outcome: Outcome;
  bids: PriceLevel[];
  asks: PriceLevel[];
  bestBid: number;
  bestAsk: number;
  spread: number;
  timestamp: number;
}

/** Aggregated view across all platforms for a single event */
export interface AggregatedOrderbook {
  globalEventId: string;
  outcome: Outcome;
  books: UnifiedOrderbook[];
  bestBid: { price: number; platform: Platform };
  bestAsk: { price: number; platform: Platform };
  arbSpread?: number; // Negative = arb opportunity
}

/** Trade intent from user or AI agent */
export interface TradeIntent {
  globalEventId: string;
  outcome: Outcome;
  side: Side;
  amount: number; // USDT amount
  maxSlippage?: number; // e.g. 0.02 = 2%
}

/** Routing decision from the Smart Order Router */
export interface RouteResult {
  intent: TradeIntent;
  legs: RouteLeg[];
  totalCost: number;
  weightedAvgPrice: number;
  estimatedShares: number;
}

/** Single execution leg of a routed trade */
export interface RouteLeg {
  platform: Platform;
  tokenId: string;
  /** Platform-native market identifier (e.g. Opinion marketId number) */
  marketId?: string;
  side: Side;
  amount: number; // USDT allocated to this leg
  expectedPrice: number;
  expectedShares: number;
}

/** Supported platforms */
export type Platform = "opinion" | "predict" | "probable";

/** User position across platforms */
export interface UnifiedPosition {
  globalEventId: string;
  question: string;
  outcome: Outcome;
  platform: Platform;
  tokenId: string;
  shares: number;
  avgEntryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
}

/** Platform adapter interface — all adapters implement this */
export interface PlatformAdapter {
  readonly platform: Platform;

  /** Fetch all active markets */
  getMarkets(): Promise<UnifiedMarket[]>;

  /** Fetch orderbook for a specific token */
  getOrderbook(tokenId: string): Promise<UnifiedOrderbook>;

  /** Get best price for a token + side */
  getPrice(tokenId: string, side: Side): Promise<number>;

  /** Get user positions */
  getPositions(walletAddress: string): Promise<UnifiedPosition[]>;
}
