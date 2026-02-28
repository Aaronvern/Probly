/**
 * Orderbook Aggregator
 *
 * Given a GlobalEvent with cross-platform token mappings,
 * fetches orderbooks from each platform and produces
 * an aggregated view with arb detection.
 */

import type { PlatformAdapter, UnifiedOrderbook, AggregatedOrderbook, Platform, Outcome } from "../types.js";
import type { GlobalEvent } from "../db/events.js";
import type { PriceFeed } from "../ws/price-feed.js";

export interface AggregatedEventView {
  globalEventId: string;
  question: string;
  platformCount: number;
  yes: AggregatedOrderbook;
  no: AggregatedOrderbook;
  /** True if buying YES on cheapest + NO on cheapest < 1.00 */
  hasArb: boolean;
  arbSpread?: number;
}

export async function aggregateOrderbooks(
  event: GlobalEvent,
  adapters: Map<Platform, PlatformAdapter>,
): Promise<AggregatedEventView> {
  const yesBooks: UnifiedOrderbook[] = [];
  const noBooks: UnifiedOrderbook[] = [];

  // Fetch orderbooks from each platform that has this event
  const fetches = event.platforms.map(async (mapping) => {
    const adapter = adapters.get(mapping.platform);
    if (!adapter) return;

    try {
      if (mapping.yesTokenId) {
        const book = await adapter.getOrderbook(mapping.yesTokenId);
        book.outcome = "YES";
        yesBooks.push(book);
      }
      if (mapping.noTokenId) {
        const book = await adapter.getOrderbook(mapping.noTokenId);
        book.outcome = "NO";
        noBooks.push(book);
      }
    } catch {
      // Silently skip failed orderbook fetches — simulated platforms handle this gracefully
    }
  });

  await Promise.allSettled(fetches);

  const yes = buildAggregatedBook(event.globalEventId, "YES", yesBooks);
  const no = buildAggregatedBook(event.globalEventId, "NO", noBooks);

  // Arb detection: if best YES ask + best NO ask < 1.00, there's free money
  const bestYesAsk = yes.bestAsk?.price ?? 1;
  const bestNoAsk = no.bestAsk?.price ?? 1;
  const totalCost = bestYesAsk + bestNoAsk;
  const hasArb = totalCost < 0.99; // ~1% threshold for fees
  const arbSpread = hasArb ? 1 - totalCost : undefined;

  return {
    globalEventId: event.globalEventId,
    question: event.question,
    platformCount: event.platforms.length,
    yes,
    no,
    hasArb,
    arbSpread,
  };
}

/**
 * Build an aggregated event view from the in-memory WS price cache.
 * Falls back gracefully if a token has no cached price.
 */
export function buildAggFromCache(event: GlobalEvent, feed: PriceFeed): AggregatedEventView {
  let yesBestAsk: { price: number; platform: Platform } = { price: 1, platform: "opinion" };
  let yesBestBid: { price: number; platform: Platform } = { price: 0, platform: "opinion" };
  let noBestAsk: { price: number; platform: Platform } = { price: 1, platform: "opinion" };
  let noBestBid: { price: number; platform: Platform } = { price: 0, platform: "opinion" };

  for (const p of event.platforms) {
    const yes = feed.get(p.yesTokenId);
    // For Predict-style (yesTokenId === noTokenId), derive NO from YES
    const no = p.yesTokenId === p.noTokenId
      ? (yes ? { bestAsk: 1 - yes.bestBid, bestBid: 1 - yes.bestAsk, updatedAt: yes.updatedAt } : undefined)
      : feed.get(p.noTokenId);
    if (yes) {
      if (yes.bestAsk < yesBestAsk.price) yesBestAsk = { price: yes.bestAsk, platform: p.platform };
      if (yes.bestBid > yesBestBid.price) yesBestBid = { price: yes.bestBid, platform: p.platform };
    }
    if (no) {
      if (no.bestAsk < noBestAsk.price) noBestAsk = { price: no.bestAsk, platform: p.platform };
      if (no.bestBid > noBestBid.price) noBestBid = { price: no.bestBid, platform: p.platform };
    }
  }

  const totalCost = yesBestAsk.price + noBestAsk.price;
  const hasArb = totalCost < 0.99;
  return {
    globalEventId: event.globalEventId,
    question: event.question,
    platformCount: event.platforms.length,
    yes: { globalEventId: event.globalEventId, outcome: "YES", books: [], bestAsk: yesBestAsk, bestBid: yesBestBid },
    no: { globalEventId: event.globalEventId, outcome: "NO", books: [], bestAsk: noBestAsk, bestBid: noBestBid },
    hasArb,
    arbSpread: hasArb ? 1 - totalCost : undefined,
  };
}

function buildAggregatedBook(
  globalEventId: string,
  outcome: Outcome,
  books: UnifiedOrderbook[],
): AggregatedOrderbook {
  let bestBid: { price: number; platform: Platform } = { price: 0, platform: "opinion" };
  let bestAsk: { price: number; platform: Platform } = { price: 1, platform: "opinion" };

  for (const book of books) {
    if (book.bestBid > bestBid.price) {
      bestBid = { price: book.bestBid, platform: book.platform };
    }
    if (book.bestAsk < bestAsk.price) {
      bestAsk = { price: book.bestAsk, platform: book.platform };
    }
  }

  return {
    globalEventId,
    outcome,
    books,
    bestBid,
    bestAsk,
    arbSpread: bestBid.price > bestAsk.price ? bestBid.price - bestAsk.price : undefined,
  };
}
