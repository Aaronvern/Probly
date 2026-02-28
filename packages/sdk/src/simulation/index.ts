/**
 * Simulation Engine
 *
 * Generates realistic market data for Predict.fun and Probable platforms.
 * Opinion Labs stays real (on-chain trades). Everything else is simulated
 * to make the app look full and polished for the hackathon demo.
 */

import type {
  PlatformAdapter,
  UnifiedMarket,
  UnifiedOrderbook,
  UnifiedPosition,
  Side,
  Outcome,
  PriceLevel,
  Platform,
} from "../types.js";
import type { GlobalEvent, TokenMapping } from "../db/events.js";
import type { Db } from "mongodb";
import { upsertGlobalEvent, getActiveEvents } from "../db/events.js";

// ---------------------------------------------------------------------------
// Realistic market seed data
// ---------------------------------------------------------------------------

interface MarketSeed {
  question: string;
  slug: string;
  /** Base YES probability (0-1) */
  basePrice: number;
  /** Which platforms carry this market */
  platforms: Platform[];
  tags?: string[];
  expiresAt?: number;
  resolutionSource?: string;
}

const MARCH_31 = new Date("2026-03-31T23:59:59Z").getTime();
const APRIL_30 = new Date("2026-04-30T23:59:59Z").getTime();
const JUNE_30 = new Date("2026-06-30T23:59:59Z").getTime();

const SEED_MARKETS: MarketSeed[] = [
  {
    question: "Will Bitcoin exceed $100,000 by March 31, 2026?",
    slug: "btc-100k-march-2026",
    basePrice: 0.72,
    platforms: ["opinion", "predict", "probable"],
    tags: ["crypto", "bitcoin"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if BTC/USDT on Binance spot exceeds $100,000 at any point before March 31, 2026 23:59 UTC",
  },
  {
    question: "Will Ethereum price exceed $4,000 by March 31, 2026?",
    slug: "eth-4000-march-2026",
    basePrice: 0.58,
    platforms: ["opinion", "predict", "probable"],
    tags: ["crypto", "ethereum"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if ETH/USDT on Binance spot exceeds $4,000 at any point before March 31, 2026 23:59 UTC",
  },
  {
    question: "Will BNB reach $800 by end of March 2026?",
    slug: "bnb-800-march-2026",
    basePrice: 0.41,
    platforms: ["opinion", "predict", "probable"],
    tags: ["crypto", "bnb"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if BNB/USDT on Binance spot exceeds $800 at any point before March 31, 2026 23:59 UTC",
  },
  {
    question: "Will the Federal Reserve cut interest rates in March 2026?",
    slug: "fed-rate-cut-march-2026",
    basePrice: 0.35,
    platforms: ["opinion", "predict"],
    tags: ["economics", "fed"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if the FOMC announces a federal funds rate cut at the March 2026 meeting",
  },
  {
    question: "Will OpenAI release GPT-5 before April 2026?",
    slug: "gpt5-release-april-2026",
    basePrice: 0.28,
    platforms: ["predict", "probable"],
    tags: ["tech", "ai"],
    expiresAt: APRIL_30,
    resolutionSource: "Resolved YES if OpenAI publicly releases or announces general availability of GPT-5 before April 30, 2026",
  },
  {
    question: "Will Solana price exceed $300 by March 2026?",
    slug: "sol-300-march-2026",
    basePrice: 0.45,
    platforms: ["opinion", "predict"],
    tags: ["crypto", "solana"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if SOL/USDT on Binance exceeds $300 before March 31, 2026 23:59 UTC",
  },
  {
    question: "Will Tesla stock exceed $450 by March 31, 2026?",
    slug: "tsla-450-march-2026",
    basePrice: 0.33,
    platforms: ["opinion", "probable"],
    tags: ["stocks", "tesla"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if TSLA closing price on NASDAQ exceeds $450 before March 31, 2026",
  },
  {
    question: "Will gold price exceed $3,200/oz by March 2026?",
    slug: "gold-3200-march-2026",
    basePrice: 0.62,
    platforms: ["predict", "probable"],
    tags: ["commodities", "gold"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if XAU/USD spot price exceeds $3,200 before March 31, 2026",
  },
  {
    question: "Will India win the Champions Trophy 2026?",
    slug: "india-champions-trophy-2026",
    basePrice: 0.38,
    platforms: ["opinion", "predict", "probable"],
    tags: ["sports", "cricket"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if India wins the ICC Champions Trophy 2026",
  },
  {
    question: "Will Nvidia stock reach $200 by March 2026?",
    slug: "nvda-200-march-2026",
    basePrice: 0.55,
    platforms: ["opinion", "predict"],
    tags: ["stocks", "nvidia"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if NVDA closing price on NASDAQ exceeds $200 before March 31, 2026",
  },
  {
    question: "Will XRP exceed $5 by March 31, 2026?",
    slug: "xrp-5-march-2026",
    basePrice: 0.22,
    platforms: ["opinion", "probable"],
    tags: ["crypto", "xrp"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if XRP/USDT on Binance exceeds $5 before March 31, 2026",
  },
  {
    question: "Will Real Madrid win Champions League 2026?",
    slug: "real-madrid-ucl-2026",
    basePrice: 0.25,
    platforms: ["predict", "probable"],
    tags: ["sports", "football"],
    expiresAt: JUNE_30,
    resolutionSource: "Resolved YES if Real Madrid wins the UEFA Champions League 2025-26 season",
  },
  {
    question: "Will a US crypto regulation bill pass in Q1 2026?",
    slug: "us-crypto-regulation-q1-2026",
    basePrice: 0.42,
    platforms: ["opinion", "predict", "probable"],
    tags: ["politics", "crypto", "regulation"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if the US Congress passes a comprehensive crypto regulation bill by March 31, 2026",
  },
  {
    question: "Will Dogecoin reach $0.50 by March 2026?",
    slug: "doge-050-march-2026",
    basePrice: 0.18,
    platforms: ["opinion", "predict"],
    tags: ["crypto", "dogecoin", "meme"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if DOGE/USDT on Binance exceeds $0.50 before March 31, 2026",
  },
  {
    question: "Will Apple announce AR glasses at WWDC 2026?",
    slug: "apple-ar-wwdc-2026",
    basePrice: 0.31,
    platforms: ["predict", "probable"],
    tags: ["tech", "apple"],
    expiresAt: JUNE_30,
    resolutionSource: "Resolved YES if Apple announces AR glasses hardware at WWDC 2026",
  },
  {
    question: "Will Sui TVL exceed $15B by March 2026?",
    slug: "sui-tvl-15b-march-2026",
    basePrice: 0.36,
    platforms: ["opinion", "probable"],
    tags: ["crypto", "defi", "sui"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if Sui blockchain TVL per DefiLlama exceeds $15B before March 31, 2026",
  },
  {
    question: "Will Bitcoin dominance exceed 60% by March 2026?",
    slug: "btc-dominance-60-march-2026",
    basePrice: 0.48,
    platforms: ["opinion", "predict", "probable"],
    tags: ["crypto", "bitcoin"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if BTC dominance per CoinGecko exceeds 60% before March 31, 2026",
  },
  {
    question: "Will SpaceX launch Starship to orbit in Q1 2026?",
    slug: "spacex-starship-orbit-q1-2026",
    basePrice: 0.52,
    platforms: ["predict", "probable"],
    tags: ["tech", "space"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if SpaceX Starship achieves orbit (completes at least one full orbit) before March 31, 2026",
  },
  {
    question: "Will Manchester City win Premier League 2025-26?",
    slug: "man-city-epl-2026",
    basePrice: 0.30,
    platforms: ["predict", "probable"],
    tags: ["sports", "football"],
    expiresAt: JUNE_30,
    resolutionSource: "Resolved YES if Manchester City wins the Premier League 2025-26 season",
  },
  {
    question: "Will Cardano exceed $2 by March 2026?",
    slug: "ada-2-march-2026",
    basePrice: 0.15,
    platforms: ["opinion", "predict"],
    tags: ["crypto", "cardano"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if ADA/USDT on Binance exceeds $2 before March 31, 2026",
  },
  {
    question: "Will Avalanche AVAX exceed $80 by March 2026?",
    slug: "avax-80-march-2026",
    basePrice: 0.27,
    platforms: ["opinion", "probable"],
    tags: ["crypto", "avalanche"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if AVAX/USDT on Binance exceeds $80 before March 31, 2026",
  },
  {
    question: "Will US unemployment rate exceed 4.5% in Q1 2026?",
    slug: "us-unemployment-45-q1-2026",
    basePrice: 0.20,
    platforms: ["predict", "probable"],
    tags: ["economics"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if the US Bureau of Labor Statistics reports unemployment rate above 4.5% in any Q1 2026 report",
  },
  {
    question: "Will a Bitcoin ETF be approved in India by March 2026?",
    slug: "btc-etf-india-march-2026",
    basePrice: 0.08,
    platforms: ["opinion", "predict", "probable"],
    tags: ["crypto", "regulation", "india"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if SEBI approves a Bitcoin ETF for trading in India before March 31, 2026",
  },
  {
    question: "Will Polkadot DOT exceed $15 by March 2026?",
    slug: "dot-15-march-2026",
    basePrice: 0.23,
    platforms: ["opinion", "probable"],
    tags: ["crypto", "polkadot"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if DOT/USDT on Binance exceeds $15 before March 31, 2026",
  },
  {
    question: "Will ChatGPT reach 500M monthly users by March 2026?",
    slug: "chatgpt-500m-march-2026",
    basePrice: 0.65,
    platforms: ["predict", "probable"],
    tags: ["tech", "ai"],
    expiresAt: MARCH_31,
    resolutionSource: "Resolved YES if OpenAI reports or credible source confirms ChatGPT exceeds 500M MAU before March 31, 2026",
  },
];

// ---------------------------------------------------------------------------
// Token ID generators (realistic-looking IDs per platform)
// ---------------------------------------------------------------------------

function deterministicHex(seed: string, length: number): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  // Extend to requested length by repeating hash with different offsets
  let result = "";
  for (let i = 0; result.length < length; i++) {
    const h2 = Math.abs(hash * (i + 7) + i * 31337).toString(16).padStart(8, "0");
    result += h2;
  }
  return result.slice(0, length);
}

function makeTokenMapping(seed: MarketSeed, platform: Platform, index: number): TokenMapping {
  const base = `${seed.slug}_${platform}_${index}`;

  if (platform === "opinion") {
    return {
      platform,
      marketId: String(1000 + index * 7 + seed.slug.length),
      yesTokenId: "0x" + deterministicHex(base + "_yes", 64),
      noTokenId: "0x" + deterministicHex(base + "_no", 64),
    };
  }
  if (platform === "predict") {
    const marketId = String(2000 + index * 3 + seed.slug.length);
    return {
      platform,
      marketId,
      yesTokenId: marketId,
      noTokenId: marketId,
    };
  }
  // probable
  return {
    platform,
    marketId: deterministicHex(base + "_mid", 24),
    yesTokenId: "0x" + deterministicHex(base + "_pyes", 64),
    noTokenId: "0x" + deterministicHex(base + "_pno", 64),
  };
}

function generateEventId(slug: string): string {
  let hash = 0;
  const normalized = slug.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash = hash & hash;
  }
  return `evt_${Math.abs(hash).toString(36)}`;
}

// ---------------------------------------------------------------------------
// Build GlobalEvent documents from seed data
// ---------------------------------------------------------------------------

function buildGlobalEvents(): GlobalEvent[] {
  return SEED_MARKETS.map((seed, idx) => {
    const platforms: TokenMapping[] = seed.platforms.map((p) => makeTokenMapping(seed, p, idx));

    return {
      globalEventId: generateEventId(seed.slug),
      question: seed.question,
      slug: seed.slug,
      outcomes: ["YES", "NO"] as Outcome[],
      status: "active" as const,
      platforms,
      resolutionSource: seed.resolutionSource,
      createdAt: Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000), // 0-7 days ago
      expiresAt: seed.expiresAt,
      tags: seed.tags,
      updatedAt: Date.now(),
    };
  });
}

// ---------------------------------------------------------------------------
// Price simulation engine
// ---------------------------------------------------------------------------

/** Map of any ID (globalEventId, marketId, tokenId) → base YES price */
const basePrices = new Map<string, number>();

function initBasePrices(): void {
  const events = buildGlobalEvents();
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const seed = SEED_MARKETS[i];
    // Index by globalEventId
    basePrices.set(event.globalEventId, seed.basePrice);
    // Also index by slug for fuzzy matching
    basePrices.set(seed.slug, seed.basePrice);
    // Also index by every marketId and tokenId for PriceFeed lookups
    for (const p of event.platforms) {
      basePrices.set(p.marketId, seed.basePrice);
      basePrices.set(p.yesTokenId, seed.basePrice);
      if (p.noTokenId !== p.yesTokenId) {
        basePrices.set(p.noTokenId, seed.basePrice);
      }
    }
  }
}

/**
 * Register a live DB event's price so the simulation can use its IDs.
 * Called during boot when we load events from MongoDB.
 */
export function registerEventPrice(globalEventId: string, platforms: TokenMapping[], basePrice?: number): void {
  // Derive a stable base price from the globalEventId hash if not provided
  const price = basePrice ?? deriveBasePrice(globalEventId);
  basePrices.set(globalEventId, price);
  for (const p of platforms) {
    basePrices.set(p.marketId, price);
    basePrices.set(p.yesTokenId, price);
    if (p.noTokenId !== p.yesTokenId) {
      basePrices.set(p.noTokenId, price);
    }
  }
}

/**
 * Derive a stable base price (0.15-0.85) from any string key.
 * Uses hash to produce a deterministic price that looks realistic.
 */
function deriveBasePrice(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash = hash & hash;
  }
  // Map to range 0.15 - 0.85
  const normalized = (Math.abs(hash) % 700) / 1000 + 0.15;
  return Math.round(normalized * 1000) / 1000;
}

/**
 * Get a simulated price with small jitter to make it look live.
 * Platform prices differ slightly to create realistic cross-platform spreads.
 */
export function getSimulatedPrice(
  anyId: string,
  platform: Platform,
  _outcome: Outcome = "YES",
): number {
  if (basePrices.size === 0) initBasePrices();
  const base = basePrices.get(anyId) ?? deriveBasePrice(anyId);

  // Platform-specific offset: each platform slightly different
  const platformOffset = platform === "opinion" ? 0 : platform === "predict" ? 0.015 : -0.012;

  // Time-based jitter: changes every ~3 seconds, amplitude ~1-2%
  const timeFactor = Math.floor(Date.now() / 3000);
  const jitter = (Math.sin(timeFactor * 1.7 + base * 100 + platformOffset * 1000) * 0.015);

  const price = Math.max(0.01, Math.min(0.99, base + platformOffset + jitter));
  return Math.round(price * 1000) / 1000;
}

/**
 * Generate a realistic orderbook around a given fair price.
 */
export function generateOrderbook(
  platform: Platform,
  tokenId: string,
  outcome: Outcome,
  fairPrice: number,
): UnifiedOrderbook {
  const spread = 0.005 + Math.random() * 0.01; // 0.5-1.5% spread
  const bestAsk = Math.min(0.99, fairPrice + spread / 2);
  const bestBid = Math.max(0.01, fairPrice - spread / 2);

  // Generate 5-8 levels of depth
  const levels = 5 + Math.floor(Math.random() * 4);
  const asks: PriceLevel[] = [];
  const bids: PriceLevel[] = [];

  for (let i = 0; i < levels; i++) {
    asks.push({
      price: Math.round((bestAsk + i * 0.01) * 1000) / 1000,
      size: Math.round((50 + Math.random() * 500) * 100) / 100,
    });
    bids.push({
      price: Math.round((bestBid - i * 0.01) * 1000) / 1000,
      size: Math.round((50 + Math.random() * 500) * 100) / 100,
    });
  }

  return {
    platform,
    tokenId,
    outcome,
    bids,
    asks,
    bestBid: Math.round(bestBid * 1000) / 1000,
    bestAsk: Math.round(bestAsk * 1000) / 1000,
    spread: Math.round((bestAsk - bestBid) * 1000) / 1000,
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Token → market lookup (for adapters that receive tokenId)
// ---------------------------------------------------------------------------

/** Maps tokenId → { globalEventId, platform, outcome } */
const tokenIndex = new Map<string, { globalEventId: string; platform: Platform; outcome: Outcome }>();

function ensureTokenIndex(): void {
  if (tokenIndex.size > 0) return;
  const events = buildGlobalEvents();
  for (const event of events) {
    for (const p of event.platforms) {
      tokenIndex.set(p.yesTokenId, { globalEventId: event.globalEventId, platform: p.platform, outcome: "YES" });
      if (p.noTokenId !== p.yesTokenId) {
        tokenIndex.set(p.noTokenId, { globalEventId: event.globalEventId, platform: p.platform, outcome: "NO" });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Simulated Predict.fun Adapter
// ---------------------------------------------------------------------------

export class SimulatedPredictAdapter implements PlatformAdapter {
  readonly platform = "predict" as const;

  async getMarkets(): Promise<UnifiedMarket[]> {
    return SEED_MARKETS
      .filter((s) => s.platforms.includes("predict"))
      .map((s, idx) => ({
        globalEventId: "",
        question: s.question,
        slug: s.slug,
        outcomes: ["YES", "NO"] as Outcome[],
        platformIds: { predict: String(2000 + idx * 3 + s.slug.length) },
        status: "active" as const,
        resolutionSource: s.resolutionSource,
        createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
        expiresAt: s.expiresAt,
        _raw: {
          conditionId: "0x" + deterministicHex(s.slug + "_predict_cond", 64),
          outcomeTokens: [
            { name: "Yes", onChainId: "0x" + deterministicHex(s.slug + "_pred_yes_oc", 64) },
            { name: "No", onChainId: "0x" + deterministicHex(s.slug + "_pred_no_oc", 64) },
          ],
          feeRateBps: 100,
        },
      }));
  }

  async getOrderbook(marketId: string): Promise<UnifiedOrderbook> {
    ensureTokenIndex();
    const info = tokenIndex.get(marketId);
    const gid = info?.globalEventId ?? "";
    const price = getSimulatedPrice(gid, "predict", "YES");
    return generateOrderbook("predict", marketId, "YES", price);
  }

  async getPrice(marketId: string, side: Side): Promise<number> {
    const book = await this.getOrderbook(marketId);
    return side === "BUY" ? book.bestAsk : book.bestBid;
  }

  async getPositions(_walletAddress: string): Promise<UnifiedPosition[]> {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Simulated Probable Adapter
// ---------------------------------------------------------------------------

export class SimulatedProbableAdapter implements PlatformAdapter {
  readonly platform = "probable" as const;

  async getMarkets(): Promise<UnifiedMarket[]> {
    return SEED_MARKETS
      .filter((s) => s.platforms.includes("probable"))
      .map((s, idx) => {
        const mid = deterministicHex(s.slug + "_probable_" + idx + "_mid", 24);
        return {
          globalEventId: "",
          question: s.question,
          slug: s.slug,
          outcomes: ["YES", "NO"] as Outcome[],
          platformIds: { probable: mid },
          status: "active" as const,
          resolutionSource: s.resolutionSource,
          createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
          expiresAt: s.expiresAt,
          _raw: {
            eventId: deterministicHex(s.slug + "_probable_eid", 24),
            conditionId: "0x" + deterministicHex(s.slug + "_probable_cond", 64),
            tokens: [
              { token_id: "0x" + deterministicHex(s.slug + "_probable_" + idx + "_pyes", 64), outcome: "Yes" },
              { token_id: "0x" + deterministicHex(s.slug + "_probable_" + idx + "_pno", 64), outcome: "No" },
            ],
            outcomeNames: ["Yes", "No"],
            volume: String(Math.floor(10000 + Math.random() * 90000)),
            liquidity: String(Math.floor(5000 + Math.random() * 50000)),
            tags: s.tags ?? [],
          },
        };
      });
  }

  async getOrderbook(tokenId: string): Promise<UnifiedOrderbook> {
    ensureTokenIndex();
    const info = tokenIndex.get(tokenId);
    const gid = info?.globalEventId ?? "";
    const outcome = info?.outcome ?? "YES";
    const yesPrice = getSimulatedPrice(gid, "probable", "YES");
    const price = outcome === "YES" ? yesPrice : 1 - yesPrice;
    return generateOrderbook("probable", tokenId, outcome, price);
  }

  async getPrice(tokenId: string, side: Side): Promise<number> {
    const book = await this.getOrderbook(tokenId);
    return side === "BUY" ? book.bestAsk : book.bestBid;
  }

  async getPositions(_walletAddress: string): Promise<UnifiedPosition[]> {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Database seeding
// ---------------------------------------------------------------------------

/**
 * Seed the database with simulated markets.
 * Merges with any existing Opinion Labs markets from real sync.
 * Returns the number of events seeded.
 */
export async function seedSimulatedMarkets(db: Db): Promise<number> {
  const simEvents = buildGlobalEvents();

  // Get existing events to check for Opinion-only markets we should enrich
  const existing = await getActiveEvents(db);
  const existingByQuestion = new Map<string, GlobalEvent>();
  for (const e of existing) {
    existingByQuestion.set(e.question.toLowerCase().trim(), e);
  }

  let seeded = 0;
  for (const simEvent of simEvents) {
    // Check if a real Opinion market exists with similar question
    const existingEvent = existingByQuestion.get(simEvent.question.toLowerCase().trim());

    if (existingEvent) {
      // Enrich existing event with simulated Predict/Probable platforms
      const existingPlatforms = new Set(existingEvent.platforms.map((p) => p.platform));
      const newPlatforms = simEvent.platforms.filter((p) => !existingPlatforms.has(p.platform));

      if (newPlatforms.length > 0) {
        existingEvent.platforms.push(...newPlatforms);
        existingEvent.updatedAt = Date.now();
        await upsertGlobalEvent(db, existingEvent);
        seeded++;
      }
    } else {
      // New simulated event
      await upsertGlobalEvent(db, simEvent);
      seeded++;
    }
  }

  return seeded;
}

/**
 * Get all simulated market subscriptions for the WS price feed.
 */
export function getSimulatedSubscriptions(): {
  platform: Platform;
  marketId: string;
  yesTokenId: string;
  noTokenId: string;
}[] {
  const events = buildGlobalEvents();
  return events.flatMap((e) =>
    e.platforms
      .filter((p) => p.platform !== "opinion") // Only simulate non-Opinion
      .map((p) => ({
        platform: p.platform,
        marketId: p.marketId,
        yesTokenId: p.yesTokenId,
        noTokenId: p.noTokenId,
      })),
  );
}

// Export for use in mock-api
export { SEED_MARKETS, buildGlobalEvents };
