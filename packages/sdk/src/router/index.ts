/**
 * Smart Order Router (SOR)
 *
 * Queries all platform adapters, compares orderbooks,
 * and calculates optimal trade split ("Meta-Bet Consensus Split").
 */

import type {
  PlatformAdapter,
  TradeIntent,
  RouteResult,
  AggregatedOrderbook,
  Platform,
} from "../types.js";

export class SmartOrderRouter {
  private adapters: Map<Platform, PlatformAdapter> = new Map();

  registerAdapter(adapter: PlatformAdapter): void {
    this.adapters.set(adapter.platform, adapter);
  }

  /** Aggregate orderbooks across all platforms for a given event */
  async getAggregatedOrderbook(
    _globalEventId: string,
    _tokenIds: Record<Platform, string>,
  ): Promise<AggregatedOrderbook> {
    // TODO: Query each adapter's orderbook, find best bid/ask, detect arb
    throw new Error("Not implemented");
  }

  /** Route a trade intent to the best venue(s) */
  async route(_intent: TradeIntent): Promise<RouteResult> {
    // TODO: Compare prices across platforms, calculate optimal split
    throw new Error("Not implemented");
  }
}
