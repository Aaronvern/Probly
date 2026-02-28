/**
 * Ghost Market Embedder
 *
 * Uses Anthropic's Voyage-3 model (via @anthropic-ai/sdk) to generate
 * 1024-dim embeddings for market questions, and performs cosine similarity
 * search against stored ghost markets.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Db } from "mongodb";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface GhostMarket {
  _id?: string;
  question: string;
  resolutionDate: string;
  resolutionSource: string;
  category: string;
  confidence: number;
  embedding: number[];
  status: "ghost" | "matched" | "rejected";
  globalEventId?: string;
  resolutionRisk?: ResolutionRisk;
  sourceArticleId: string;
  createdAt: number;
}

export interface ResolutionRisk {
  level: "low" | "medium" | "high" | "critical";
  reasons: string[];
  recommendation: string;
  checkedAt: number;
}

export interface SimilarityMatch {
  ghost: GhostMarket;
  score: number;
}

/**
 * Generate a 1024-dim Voyage-3 embedding for a text string.
 */
export async function embed(text: string): Promise<number[]> {
  const response = await client.embeddings.create({
    model: "voyage-3",
    input: text,
  } as any);
  return (response as any).data[0].embedding as number[];
}

/**
 * Cosine similarity between two equal-length vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find ghost markets similar to a given embedding.
 * Scans all ghost_markets with status="ghost" in MongoDB.
 */
export async function findSimilar(
  db: Db,
  embedding: number[],
  threshold = 0.85,
): Promise<SimilarityMatch[]> {
  const ghosts = await db
    .collection<GhostMarket>("ghost_markets")
    .find({ status: "ghost" })
    .toArray();

  const matches: SimilarityMatch[] = [];
  for (const ghost of ghosts) {
    if (!ghost.embedding?.length) continue;
    const score = cosineSimilarity(embedding, ghost.embedding);
    if (score >= threshold) {
      matches.push({ ghost, score });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}
