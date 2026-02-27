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
