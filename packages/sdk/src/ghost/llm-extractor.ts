/**
 * Ghost Market LLM Extractor
 *
 * Uses Claude Haiku to determine if a news article describes a binary
 * predictable event, and if so, extracts a structured ghost market proposal.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Db } from "mongodb";
import { embed } from "./embedder.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface GhostMarketProposal {
  question: string;
  resolutionDate: string;       // ISO date string e.g. "2026-03-31"
  resolutionSource: string;     // e.g. "CoinGecko", "Reuters", "Official results"
  category: "crypto" | "politics" | "sports" | "finance" | "tech" | "other";
  confidence: number;           // 0–1
}

const EXTRACTION_PROMPT = `You are a prediction market analyst. Given a news article, determine if it describes a binary event that could be the basis of a prediction market question.

A good prediction market question:
- Has a clear YES/NO resolution
- Has a specific, verifiable resolution date
- Has an objective resolution source (e.g. CoinGecko price, official election results, company announcement)
- Is about something that will happen in the future

Respond with JSON only. No explanation. If the article cannot form a good prediction market, set isPredictable to false.

Schema:
{
  "isPredictable": boolean,
  "question": string,           // e.g. "Will BTC exceed $100K by March 2026?"
  "resolutionDate": string,     // ISO date e.g. "2026-03-31"
  "resolutionSource": string,   // e.g. "CoinGecko", "Reuters"
  "category": "crypto" | "politics" | "sports" | "finance" | "tech" | "other",
  "confidence": number          // 0.0 to 1.0 — how confident you are this is a good market
}`;

/**
 * Extract a ghost market proposal from a news article using Claude Haiku.
 * Returns null if the article doesn't describe a predictable binary event.
 */
export async function extractGhostMarket(
  headline: string,
  body: string,
): Promise<GhostMarketProposal | null> {
  const content = `Headline: ${headline}\n\nBody: ${body.slice(0, 1500)}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 512,
    messages: [
      { role: "user", content: `${EXTRACTION_PROMPT}\n\nArticle:\n${content}` },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    // Strip markdown code fences if Claude wraps response in ```json ... ```
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);
    if (!parsed.isPredictable || parsed.confidence < 0.45) {
      console.log(`[LLMExtractor] Skipped: isPredictable=${parsed.isPredictable} confidence=${parsed.confidence}`);
      return null;
    }
    return {
      question: parsed.question,
      resolutionDate: parsed.resolutionDate,
      resolutionSource: parsed.resolutionSource,
      category: parsed.category ?? "other",
      confidence: parsed.confidence,
    };
  } catch (e: any) {
    console.warn(`[LLMExtractor] JSON parse failed: ${e.message} | raw: ${text.slice(0, 100)}`);
    return null;
  }
}

/**
 * Process all unprocessed news articles, extract ghost markets, embed and store them.
 * Marks each article processed: true when done.
 */
export async function processUnprocessedArticles(db: Db): Promise<number> {
  const articles = await db
    .collection("news_articles")
    .find({ processed: false })
    .limit(50)
    .toArray();

  console.log(`[LLMExtractor] Processing ${articles.length} unprocessed articles...`);
  let created = 0;

  for (const article of articles) {
    try {
      console.log(`[LLMExtractor] → "${article.headline?.slice(0, 60)}"`);
      const proposal = await extractGhostMarket(article.headline, article.body ?? "");

      if (proposal) {
        const embedding = await embed(proposal.question);
        await db.collection("ghost_markets").insertOne({
          question: proposal.question,
          resolutionDate: proposal.resolutionDate,
          resolutionSource: proposal.resolutionSource,
          category: proposal.category,
          confidence: proposal.confidence,
          embedding,
          status: "ghost",
          sourceArticleId: String(article._id),
          createdAt: Date.now(),
        });
        created++;
      }

      await db.collection("news_articles").updateOne(
        { _id: article._id },
        { $set: { processed: true } },
      );
    } catch (err: any) {
      console.warn(`[LLMExtractor] Failed to process article ${article._id}: ${err.message}`);
    }
  }

  return created;
}
