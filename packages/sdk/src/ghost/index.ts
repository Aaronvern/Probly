/**
 * Ghost Market Engine
 *
 * Orchestrates both async tracks:
 *
 * Predictive Track:
 *   - NewsIngester polls NewsAPI every 15 min
 *   - LLMExtractor processes articles → ghost markets
 *
 * Reactive Track:
 *   - Called externally when a real market arrives from an adapter
 *   - matchRealMarket() embeds and matches against ghost DB
 *
 * Usage:
 *   const engine = new GhostEngine(db);
 *   engine.start();
 *   // ... later when a real market arrives:
 *   const match = await engine.matchMarket(globalEventId, question, date, source);
 *   engine.stop();
 */

import type { Db } from "mongodb";
import { processUnprocessedArticles } from "./llm-extractor.js";
import { startNewsIngester } from "./news-ingester.js";
import { matchRealMarket, type MatchResult } from "./matcher.js";

const EXTRACTOR_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes (runs after news ingest)

export class GhostEngine {
  private db: Db;
  private stopIngester: (() => void) | null = null;
  private extractorTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(db: Db) {
    this.db = db;
  }

  /**
   * Start both predictive tracks.
   */
  start(): void {
    if (this.running) {
      console.warn("[GhostEngine] Already running");
      return;
    }
    this.running = true;
    console.log("[GhostEngine] Starting predictive + reactive tracks");

    // Start NewsIngester (polls every 15 min, runs immediately)
    this.stopIngester = startNewsIngester(this.db);

    // Start LLM Extractor loop (runs every 5 min)
    // Give newsIngester a 30s head-start on first run
    setTimeout(() => {
      processUnprocessedArticles(this.db)
        .then((n) => console.log(`[GhostEngine] Extracted ${n} ghost markets on startup`))
        .catch(console.error);
    }, 30_000);

    this.extractorTimer = setInterval(() => {
      processUnprocessedArticles(this.db)
        .then((n) => { if (n > 0) console.log(`[GhostEngine] Extracted ${n} new ghost markets`); })
        .catch(console.error);
    }, EXTRACTOR_INTERVAL_MS);
  }

  /**
   * Stop all background loops.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    this.stopIngester?.();
    this.stopIngester = null;

    if (this.extractorTimer) {
      clearInterval(this.extractorTimer);
      this.extractorTimer = null;
    }

    console.log("[GhostEngine] Stopped");
  }

  /**
   * Reactive track: match a newly synced real market to a ghost market.
   * Call this whenever an adapter syncs a new market into GlobalEvents.
   */
  async matchMarket(
    globalEventId: string,
    question: string,
    resolutionDate?: string,
    resolutionSource?: string,
  ): Promise<MatchResult | null> {
    return matchRealMarket(
      this.db,
      globalEventId,
      question,
      resolutionDate,
      resolutionSource,
    );
  }

  /**
   * One-shot: process any pending unprocessed articles immediately.
   * Useful for tests or manual triggers.
   */
  async processNow(): Promise<number> {
    return processUnprocessedArticles(this.db);
  }
}

// Re-export types for convenience
export type { MatchResult } from "./matcher.js";
export type { GhostMarketProposal } from "./llm-extractor.js";
export type { GhostMarket, ResolutionRisk, SimilarityMatch } from "./embedder.js";
