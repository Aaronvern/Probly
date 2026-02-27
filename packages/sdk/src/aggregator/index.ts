/**
 * Orderbook Aggregator
 *
 * Given a GlobalEvent with cross-platform token mappings,
 * fetches orderbooks from each platform and produces
 * an aggregated view with arb detection.
 */

import type { PlatformAdapter, UnifiedOrderbook, AggregatedOrderbook, Platform, Outcome } from "../types.js";
import type { GlobalEvent } from "../db/events.js";

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
    } catch (err: any) {
      console.warn(`[Aggregator] Failed to fetch orderbook from ${mapping.platform}: ${err.message}`);
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
