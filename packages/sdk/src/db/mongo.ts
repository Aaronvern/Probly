/**
 * MongoDB connection singleton
 */

import { MongoClient, Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDB(uri: string): Promise<Db> {
  if (db) return db;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db();
  console.log(`✓ MongoDB connected: ${db.databaseName}`);
  return db;
}

export function getDB(): Db {
  if (!db) throw new Error("MongoDB not connected — call connectDB() first");
  return db;
}

export async function closeDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
