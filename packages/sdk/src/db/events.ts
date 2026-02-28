/**
 * GlobalEvent collection — maps identical markets across platforms
 *
 * A GlobalEvent represents a single real-world question
 * (e.g. "BTC > $70K by March") that may exist on 1-3 platforms.
 */

import type { Collection, Db } from "mongodb";
import type { Platform, Outcome } from "../types.js";

export interface TokenMapping {
  platform: Platform;
  marketId: string;
  yesTokenId: string;
  noTokenId: string;
}

export interface OrderbookCache {
  yes: { bestAsk?: { price: number; platform: Platform }; bestBid?: { price: number; platform: Platform } };
  no: { bestAsk?: { price: number; platform: Platform }; bestBid?: { price: number; platform: Platform } };
  hasArb: boolean;
  arbSpread?: number;
  cachedAt: number;
}

export interface GlobalEvent {
  _id?: string;
  globalEventId: string;
  question: string;
  slug: string;
  outcomes: Outcome[];
  status: "active" | "closed" | "resolved";
  platforms: TokenMapping[];
  resolutionSource?: string;
  createdAt: number;
  expiresAt?: number;
  tags?: string[];
  updatedAt: number;
  orderbookCache?: OrderbookCache;
}

let collection: Collection<GlobalEvent> | null = null;

export function getEventsCollection(db: Db): Collection<GlobalEvent> {
  if (!collection) {
    collection = db.collection<GlobalEvent>("global_events");
  }
  return collection;
}

export async function ensureIndexes(db: Db): Promise<void> {
  const col = getEventsCollection(db);
  await col.createIndex({ globalEventId: 1 }, { unique: true });
  await col.createIndex({ "platforms.platform": 1, "platforms.marketId": 1 });
  await col.createIndex({ status: 1 });
  await col.createIndex({ slug: 1 });

  // Social collections
  await db.collection("comments").createIndex({ marketId: 1, createdAt: -1 });
  await db.collection("likes").createIndex({ marketId: 1, address: 1 }, { unique: true });
  await db.collection("follows").createIndex({ followerAddress: 1 });
  await db.collection("follows").createIndex({ followerAddress: 1, targetAddress: 1 }, { unique: true });
  await db.collection("saves").createIndex({ address: 1 });
  await db.collection("saves").createIndex({ address: 1, marketId: 1 }, { unique: true });

  // Ghost market + news
  await db.collection("ghost_markets").createIndex({ status: 1, createdAt: -1 });
  await db.collection("news_articles").createIndex({ processed: 1 });
  await db.collection("news_articles").createIndex({ url: 1 }, { unique: true });
}

export async function upsertGlobalEvent(
  db: Db,
  event: GlobalEvent,
): Promise<void> {
  const col = getEventsCollection(db);
  await col.updateOne(
    { globalEventId: event.globalEventId },
    { $set: { ...event, updatedAt: Date.now() } },
    { upsert: true },
  );
}

export async function getActiveEvents(db: Db): Promise<GlobalEvent[]> {
  const col = getEventsCollection(db);
  return col.find({ status: "active" }).toArray();
}

export async function getEventById(
  db: Db,
  globalEventId: string,
): Promise<GlobalEvent | null> {
  const col = getEventsCollection(db);
  return col.findOne({ globalEventId });
}

export async function bulkUpdateOrderbookCache(
  db: Db,
  updates: { globalEventId: string; cache: OrderbookCache }[],
): Promise<void> {
  if (updates.length === 0) return;
  const col = getEventsCollection(db);
  await Promise.all(
    updates.map(({ globalEventId, cache }) =>
      col.updateOne(
        { globalEventId },
        { $set: { orderbookCache: cache, updatedAt: Date.now() } },
      ),
    ),
  );
}
