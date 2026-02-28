/**
 * Probly API Server
 *
 * Unified backend for the prediction market aggregator.
 */

import express from "express";
import cors from "cors";
import "dotenv/config";
import { OpinionAdapter } from "../../../packages/sdk/src/adapters/opinion.js";
import { connectDB } from "../../../packages/sdk/src/db/mongo.js";
import { ensureIndexes, getActiveEvents, getEventById } from "../../../packages/sdk/src/db/events.js";
import { aggregateOrderbooks, buildAggFromCache } from "../../../packages/sdk/src/aggregator/index.js";
import { PriceFeed } from "../../../packages/sdk/src/ws/price-feed.js";
import { SmartOrderRouter } from "../../../packages/sdk/src/router/index.js";
import {
  SimulatedPredictAdapter,
  SimulatedProbableAdapter,
  seedSimulatedMarkets,
  registerEventPrice,
} from "../../../packages/sdk/src/simulation/index.js";
import type { Platform, PlatformAdapter, TradeIntent, RouteLeg } from "../../../packages/sdk/src/types.js";
import type { GlobalEvent, TokenMapping } from "../../../packages/sdk/src/db/events.js";
import type { ExecutionLeg } from "../../../packages/sdk/src/router/index.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Init adapters — Opinion is real (on-chain), Predict/Probable are simulated
const opinion = new OpinionAdapter(process.env.OPINIONLABS_API_KEY!);
const predict = new SimulatedPredictAdapter();
const probable = new SimulatedProbableAdapter();

const adaptersList: PlatformAdapter[] = [opinion, predict, probable];
const adaptersMap = new Map<Platform, PlatformAdapter>([
  ["opinion", opinion],
  ["predict", predict],
  ["probable", probable],
]);

// Init Smart Order Router
const sor = new SmartOrderRouter();
for (const adapter of adaptersList) sor.registerAdapter(adapter);

// WS price feed — started on boot, shared across all requests
const priceFeed = new PriceFeed();

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "probly-api", timestamp: Date.now() });
});

// GET /api/markets — unified market list from MongoDB
app.get("/api/markets", async (_req, res) => {
  try {
    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    const events = await getActiveEvents(db);
    res.json({
      count: events.length,
      events: events.map((e: GlobalEvent) => ({
        globalEventId: e.globalEventId,
        question: e.question,
        slug: e.slug,
        status: e.status,
        platformCount: e.platforms.length,
        platforms: e.platforms.map((p: TokenMapping) => p.platform),
        tags: e.tags,
        expiresAt: e.expiresAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prices — all active markets with best prices from WS cache (instant)
// Falls back to REST for tokens not yet in cache. Frontend should poll this at ~2s interval.
app.get("/api/prices", async (_req, res) => {
  try {
    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    const events = await getActiveEvents(db);
    const CACHE_MAX_AGE = 60_000;

    const results = await Promise.all(events.map(async (event: GlobalEvent) => {
      // Use WS cache if ANY non-Opinion platform has fresh data.
      // buildAggFromCache handles missing platforms gracefully (defaults to ask=1, bid=0).
      const hasWsData = event.platforms.some((p: TokenMapping) =>
        p.platform !== "opinion" && priceFeed.isFresh(p.yesTokenId, CACHE_MAX_AGE),
      );

      if (hasWsData) {
        const agg = buildAggFromCache(event, priceFeed);
        const platformPrices: Record<string, { yes: number | null; no: number | null }> = {};
        for (const p of event.platforms as TokenMapping[]) {
          const yesCache = priceFeed.get(p.yesTokenId);
          const noCache = p.yesTokenId === p.noTokenId
            ? null // Predict-style: derive NO from YES
            : priceFeed.get(p.noTokenId);
          const yesPrice = yesCache ? Math.round(yesCache.bestAsk * 1000) / 1000 : null;
          const noPrice = noCache
            ? Math.round(noCache.bestAsk * 1000) / 1000
            : yesPrice !== null ? Math.round((1 - yesPrice) * 1000) / 1000 : null;
          platformPrices[p.platform] = { yes: yesPrice, no: noPrice };
        }
        return {
          globalEventId: event.globalEventId,
          question: event.question,
          platforms: event.platforms.map((p: TokenMapping) => p.platform),
          yes: { bestAsk: agg.yes.bestAsk?.price, bestAskPlatform: agg.yes.bestAsk?.platform },
          no: { bestAsk: agg.no.bestAsk?.price, bestAskPlatform: agg.no.bestAsk?.platform },
          hasArb: agg.hasArb,
          arbSpread: agg.arbSpread,
          dataSource: "ws" as const,
          platformPrices,
        };
      }

      // FIX 3: REST fallback — only for Predict/Probable (they handle parallel calls fine).
      // Opinion is event-driven WS only; skip its REST to avoid 429 storms.
      // Opinion-only markets show as "pending" until WS fires a trade event.
      const nonOpinionPlatforms = event.platforms.filter((p: TokenMapping) => p.platform !== "opinion");
      if (nonOpinionPlatforms.length === 0) {
        // Opinion-only market: return last WS price if any, else pending
        const cachedAgg = buildAggFromCache(event, priceFeed);
        const hasAnyPrice = cachedAgg.yes.bestAsk?.price < 1 || cachedAgg.no.bestAsk?.price < 1;
        return {
          globalEventId: event.globalEventId,
          question: event.question,
          platforms: event.platforms.map((p: TokenMapping) => p.platform),
          yes: { bestAsk: hasAnyPrice ? cachedAgg.yes.bestAsk?.price : null, bestAskPlatform: hasAnyPrice ? cachedAgg.yes.bestAsk?.platform : null },
          no: { bestAsk: hasAnyPrice ? cachedAgg.no.bestAsk?.price : null, bestAskPlatform: hasAnyPrice ? cachedAgg.no.bestAsk?.platform : null },
          hasArb: false,
          arbSpread: undefined,
          dataSource: hasAnyPrice ? "ws" as const : "pending" as const,
          platformPrices: {},
        };
      }

      try {
        // Build a partial adapters map without Opinion for REST fallback
        const fallbackMap = new Map(
          [...adaptersMap].filter(([k]) => k !== "opinion"),
        );
        const agg = await aggregateOrderbooks(event, fallbackMap);
        const platformPrices: Record<string, { yes: number | null; no: number | null }> = {};
        for (const book of agg.yes.books) {
          platformPrices[book.platform] = { yes: book.bestAsk, no: null };
        }
        for (const book of agg.no.books) {
          if (platformPrices[book.platform]) {
            platformPrices[book.platform].no = book.bestAsk;
          } else {
            platformPrices[book.platform] = { yes: null, no: book.bestAsk };
          }
        }
        return {
          globalEventId: event.globalEventId,
          question: event.question,
          platforms: event.platforms.map((p: TokenMapping) => p.platform),
          yes: { bestAsk: agg.yes.bestAsk?.price, bestAskPlatform: agg.yes.bestAsk?.platform },
          no: { bestAsk: agg.no.bestAsk?.price, bestAskPlatform: agg.no.bestAsk?.platform },
          hasArb: agg.hasArb,
          arbSpread: agg.arbSpread,
          dataSource: "rest" as const,
          platformPrices,
        };
      } catch {
        return {
          globalEventId: event.globalEventId,
          question: event.question,
          platforms: event.platforms.map((p: TokenMapping) => p.platform),
          yes: { bestAsk: null, bestAskPlatform: null },
          no: { bestAsk: null, bestAskPlatform: null },
          hasArb: false,
          arbSpread: undefined,
          dataSource: "none" as const,
        };
      }
    }));

    res.json({ count: results.length, updatedAt: Date.now(), markets: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orderbook/:globalEventId — full aggregated orderbook with arb detection
app.get("/api/orderbook/:globalEventId", async (req, res) => {
  try {
    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    const event = await getEventById(db, req.params.globalEventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    // Use WS cache if any non-Opinion platform has fresh data
    const allFresh = event.platforms.some((p: TokenMapping) =>
      p.platform !== "opinion" && priceFeed.isFresh(p.yesTokenId, 60_000),
    );
    if (allFresh) {
      const agg = buildAggFromCache(event, priceFeed);
      res.json({ ...agg, dataSource: "ws" });
      return;
    }

    const aggregated = await aggregateOrderbooks(event, adaptersMap);
    res.json({ ...aggregated, dataSource: "rest" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trade/quote — get optimal routing plan for a trade intent
// Body: { globalEventId, outcome: "YES"|"NO", side: "BUY"|"SELL", amount: number, maxSlippage?: number }
app.post("/api/trade/quote", async (req, res) => {
  try {
    const { globalEventId, outcome, side, amount, maxSlippage } = req.body as TradeIntent;
    if (!globalEventId || !outcome || !side || !amount) {
      res.status(400).json({ error: "Missing required fields: globalEventId, outcome, side, amount" });
      return;
    }

    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    const event = await getEventById(db, globalEventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (event.platforms.length === 0) {
      res.status(400).json({ error: "Event has no platform listings" });
      return;
    }

    const intent: TradeIntent = { globalEventId, outcome, side, amount, maxSlippage };
    const route = await sor.quote(intent, event);

    res.json({
      globalEventId,
      question: event.question,
      intent,
      route: {
        legs: route.legs.map((l: RouteLeg) => ({
          platform: l.platform,
          tokenId: l.tokenId,
          amount: l.amount,
          expectedPrice: l.expectedPrice,
          expectedShares: l.expectedShares,
          allocationPct: Math.round((l.amount / route.totalCost) * 1000) / 10,
        })),
        totalCost: route.totalCost,
        weightedAvgPrice: route.weightedAvgPrice,
        estimatedShares: route.estimatedShares,
        platformCount: route.legs.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trade/execute — execute a routed trade and record in DB
// Body: { globalEventId, outcome, side, amount, maxSlippage?, walletAddress? }
app.post("/api/trade/execute", async (req, res) => {
  try {
    const { globalEventId, outcome, side, amount, maxSlippage, walletAddress } = req.body;
    if (!globalEventId || !outcome || !side || !amount) {
      res.status(400).json({ error: "Missing required fields: globalEventId, outcome, side, amount" });
      return;
    }

    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    const event = await getEventById(db, globalEventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const intent: TradeIntent = { globalEventId, outcome, side, amount, maxSlippage };
    const route = await sor.quote(intent, event);
    const result = await sor.execute(route);

    // Generate a realistic BSC tx hash
    const txHash = "0x" + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");

    // Record each leg as a trade in MongoDB
    if (walletAddress && result.success) {
      const trades = result.legs.map((l: ExecutionLeg) => ({
        walletAddress: walletAddress.toLowerCase(),
        globalEventId,
        question: event.question,
        outcome,
        side: side || "BUY",
        platform: l.platform,
        tokenId: l.tokenId,
        amount: l.amount,
        price: l.expectedPrice,
        shares: l.amount / l.expectedPrice,
        txHash,
        orderId: l.orderId,
        simulated: l.simulated,
        timestamp: Date.now(),
      }));
      await db.collection("trades").insertMany(trades);
    }

    res.json({
      globalEventId,
      question: event.question,
      success: result.success,
      totalSpent: result.totalSpent,
      txHash,
      legs: result.legs.map((l: ExecutionLeg) => ({
        platform: l.platform,
        tokenId: l.tokenId,
        amount: l.amount,
        expectedPrice: l.expectedPrice,
        orderId: l.orderId,
        simulated: l.simulated,
        ...(l.error ? { error: l.error } : {}),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Social API ────────────────────────────────────────────────────────────────

// GET /api/social/comments/:marketId
app.get("/api/social/comments/:marketId", async (req, res) => {
  try {
    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    const comments = await db.collection("comments")
      .find({ marketId: req.params.marketId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json(comments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/social/comments
app.post("/api/social/comments", async (req, res) => {
  try {
    const { marketId, text, authorAddress, author } = req.body;
    if (!marketId || !text || !authorAddress) {
      res.status(400).json({ error: "Missing marketId, text, or authorAddress" });
      return;
    }
    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    const doc = { marketId, text: text.slice(0, 280), author, authorAddress, createdAt: Date.now() };
    const result = await db.collection("comments").insertOne(doc);
    res.json({ ...doc, _id: result.insertedId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/social/follow
app.post("/api/social/follow", async (req, res) => {
  try {
    const { followerAddress, targetAddress } = req.body;
    if (!followerAddress || !targetAddress) {
      res.status(400).json({ error: "Missing followerAddress or targetAddress" });
      return;
    }
    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    await db.collection("follows").updateOne(
      { followerAddress, targetAddress },
      { $set: { followerAddress, targetAddress, createdAt: Date.now() } },
      { upsert: true },
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/social/following/:address
app.get("/api/social/following/:address", async (req, res) => {
  try {
    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    const follows = await db.collection("follows")
      .find({ followerAddress: req.params.address })
      .toArray();
    res.json(follows.map((f: any) => f.targetAddress));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/social/stats/:marketId — likes count + comment count in one shot
app.get("/api/social/stats/:marketId", async (req, res) => {
  try {
    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    const { marketId } = req.params;
    const { address } = req.query as { address?: string };
    const [likes, comments] = await Promise.all([
      db.collection("likes").countDocuments({ marketId }),
      db.collection("comments").countDocuments({ marketId }),
    ]);
    const liked = address
      ? !!(await db.collection("likes").findOne({ marketId, address }))
      : false;
    res.json({ likes, comments, liked });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/social/like — toggle like
app.post("/api/social/like", async (req, res) => {
  try {
    const { marketId, address } = req.body;
    if (!marketId || !address) {
      res.status(400).json({ error: "Missing marketId or address" });
      return;
    }
    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    const existing = await db.collection("likes").findOne({ marketId, address });
    if (existing) {
      await db.collection("likes").deleteOne({ marketId, address });
      res.json({ liked: false });
    } else {
      await db.collection("likes").insertOne({ marketId, address, createdAt: Date.now() });
      res.json({ liked: true });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/portfolio/:address — positions computed from trade history + live prices
app.get("/api/portfolio/:address", async (req, res) => {
  try {
    const { address } = req.params;
    if (!address) {
      res.status(400).json({ error: "Missing wallet address" });
      return;
    }

    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();

    // Fetch all trades for this wallet
    const trades = await db.collection("trades")
      .find({ walletAddress: address.toLowerCase() })
      .sort({ timestamp: -1 })
      .toArray();

    if (trades.length === 0) {
      res.json({ address, positions: [], count: 0 });
      return;
    }

    // Group trades into positions: key = globalEventId + outcome + platform
    const posMap = new Map<string, {
      globalEventId: string;
      question: string;
      outcome: string;
      platform: string;
      totalShares: number;
      totalCost: number;
      trades: number;
    }>();

    for (const t of trades) {
      const key = `${t.globalEventId}:${t.outcome}:${t.platform}`;
      const existing = posMap.get(key);
      const shares = t.shares ?? (t.amount / t.price);
      const cost = t.amount;

      if (t.side === "SELL") {
        // SELL reduces position
        if (existing) {
          existing.totalShares -= shares;
          existing.totalCost -= cost;
          existing.trades++;
        }
      } else {
        // BUY adds to position
        if (existing) {
          existing.totalShares += shares;
          existing.totalCost += cost;
          existing.trades++;
        } else {
          posMap.set(key, {
            globalEventId: t.globalEventId,
            question: t.question,
            outcome: t.outcome,
            platform: t.platform,
            totalShares: shares,
            totalCost: cost,
            trades: 1,
          });
        }
      }
    }

    // Convert to positions with live prices from WS cache
    const positions = [];
    for (const pos of posMap.values()) {
      if (pos.totalShares <= 0) continue; // Fully closed position

      const avgEntryPrice = pos.totalCost / pos.totalShares;

      // Get current price from WS cache via the event's token mapping
      let currentPrice = avgEntryPrice; // fallback
      const event = await getEventById(db, pos.globalEventId);
      if (event) {
        const mapping = event.platforms.find((p: TokenMapping) => p.platform === pos.platform);
        if (mapping) {
          const tokenId = pos.outcome === "YES" ? mapping.yesTokenId : mapping.noTokenId;
          const cached = priceFeed.get(tokenId);
          if (cached) {
            currentPrice = cached.bestAsk;
          } else if (pos.outcome === "NO" && mapping.yesTokenId === mapping.noTokenId) {
            // Predict-style: derive NO from YES
            const yesCached = priceFeed.get(mapping.yesTokenId);
            if (yesCached) currentPrice = 1 - yesCached.bestBid;
          }
        }
      }

      const pnl = (currentPrice - avgEntryPrice) * pos.totalShares;
      const pnlPercent = avgEntryPrice > 0 ? ((currentPrice - avgEntryPrice) / avgEntryPrice) * 100 : 0;

      positions.push({
        globalEventId: pos.globalEventId,
        question: pos.question,
        outcome: pos.outcome,
        platform: pos.platform,
        shares: Math.round(pos.totalShares * 100) / 100,
        avgEntryPrice: Math.round(avgEntryPrice * 1000) / 1000,
        currentPrice: Math.round(currentPrice * 1000) / 1000,
        pnl: Math.round(pnl * 100) / 100,
        pnlPercent: Math.round(pnlPercent * 10) / 10,
      });
    }

    res.json({ address, positions, count: positions.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── OTC Cash-Out ─────────────────────────────────────────────────────────────

const OTC_POOL_ADDRESS = process.env.OTC_POOL_ADDRESS!;
const OTC_DISCOUNT_BPS = 500; // 5%
const BPS_DENOM = 10_000;

// POST /api/otc/quote — get OTC cash-out price at 5% discount
// Body: { globalEventId, outcome: "YES"|"NO", shares: number }
app.post("/api/otc/quote", async (req, res) => {
  try {
    const { globalEventId, outcome, shares } = req.body;
    if (!globalEventId || !outcome || !shares) {
      res.status(400).json({ error: "Missing required fields: globalEventId, outcome, shares" });
      return;
    }

    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    const event = await getEventById(db, globalEventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    // Get best current price for this outcome from aggregated orderbook
    const hasWsData = event.platforms.some((p: TokenMapping) =>
      p.platform !== "opinion" && priceFeed.isFresh(p.yesTokenId, 60_000),
    );
    let fairPrice: number | null = null;
    if (hasWsData) {
      const agg = buildAggFromCache(event, priceFeed);
      fairPrice = outcome === "YES" ? agg.yes.bestAsk?.price ?? null : agg.no.bestAsk?.price ?? null;
    } else {
      const fallbackMap = new Map([...adaptersMap].filter(([k]) => k !== "opinion"));
      try {
        const agg = await aggregateOrderbooks(event, fallbackMap);
        fairPrice = outcome === "YES" ? agg.yes.bestAsk?.price ?? null : agg.no.bestAsk?.price ?? null;
      } catch { /* no price available */ }
    }

    if (fairPrice === null || fairPrice <= 0) {
      res.status(400).json({ error: "No fair price available for this outcome" });
      return;
    }

    const discountedPrice = fairPrice * (BPS_DENOM - OTC_DISCOUNT_BPS) / BPS_DENOM;
    const usdtOut = shares * discountedPrice;
    const discount = shares * fairPrice - usdtOut;

    res.json({
      globalEventId,
      question: event.question,
      outcome,
      shares,
      fairPrice,
      discountedPrice,
      discountPct: OTC_DISCOUNT_BPS / 100,
      usdtOut: Math.round(usdtOut * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      poolAddress: OTC_POOL_ADDRESS,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/otc/cashout — execute OTC cash-out (simulated on testnet)
// Body: { globalEventId, outcome: "YES"|"NO", shares: number, minUsdt?: number, walletAddress? }
app.post("/api/otc/cashout", async (req, res) => {
  try {
    const { globalEventId, outcome, shares, minUsdt, walletAddress } = req.body;
    if (!globalEventId || !outcome || !shares) {
      res.status(400).json({ error: "Missing required fields: globalEventId, outcome, shares" });
      return;
    }

    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    const event = await getEventById(db, globalEventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    // Compute payout (same logic as /quote)
    const hasWsData = event.platforms.some((p: TokenMapping) =>
      p.platform !== "opinion" && priceFeed.isFresh(p.yesTokenId, 60_000),
    );
    let fairPrice: number | null = null;
    if (hasWsData) {
      const agg = buildAggFromCache(event, priceFeed);
      fairPrice = outcome === "YES" ? agg.yes.bestAsk?.price ?? null : agg.no.bestAsk?.price ?? null;
    } else {
      const fallbackMap = new Map([...adaptersMap].filter(([k]) => k !== "opinion"));
      try {
        const agg = await aggregateOrderbooks(event, fallbackMap);
        fairPrice = outcome === "YES" ? agg.yes.bestAsk?.price ?? null : agg.no.bestAsk?.price ?? null;
      } catch { /* no price */ }
    }

    if (fairPrice === null || fairPrice <= 0) {
      res.status(400).json({ error: "No fair price available" });
      return;
    }

    const discountedPrice = fairPrice * (BPS_DENOM - OTC_DISCOUNT_BPS) / BPS_DENOM;
    const usdtOut = Math.round(shares * discountedPrice * 100) / 100;

    if (minUsdt && usdtOut < minUsdt) {
      res.status(400).json({ error: "Slippage exceeded: payout below minUsdt" });
      return;
    }

    // Simulated execution against OTCPool on testnet
    // In production this would call OTCPool.cashOut() via Biconomy session key
    const txHash = "0x" + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");

    // Record the SELL trade in DB
    if (walletAddress) {
      await db.collection("trades").insertOne({
        walletAddress: walletAddress.toLowerCase(),
        globalEventId,
        question: event.question,
        outcome,
        side: "SELL",
        platform: "otc",
        tokenId: "otc-pool",
        amount: usdtOut,
        price: discountedPrice,
        shares,
        txHash,
        orderId: null,
        simulated: true,
        timestamp: Date.now(),
      });
    }

    res.json({
      success: true,
      globalEventId,
      outcome,
      shares,
      fairPrice,
      discountedPrice,
      usdtOut,
      txHash,
      poolAddress: OTC_POOL_ADDRESS,
      simulated: true,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trades/:address — trade history for a wallet
app.get("/api/trades/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    const trades = await db.collection("trades")
      .find({ walletAddress: address.toLowerCase() })
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();
    res.json({ address, trades, count: trades.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync — trigger market sync (re-seeds simulated data)
app.post("/api/sync", async (_req, res) => {
  try {
    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    const seeded = await seedSimulatedMarkets(db);
    const events = await getActiveEvents(db);
    res.json({ success: true, created: seeded, updated: 0, total: events.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Startup
async function boot() {
  // Connect to MongoDB
  const db = await connectDB(process.env.MONGODB_URI!);
  await ensureIndexes(db);

  // Ensure trades collection indexes
  await db.collection("trades").createIndex({ walletAddress: 1, timestamp: -1 });
  await db.collection("trades").createIndex({ globalEventId: 1 });

  // Seed simulated markets (Predict.fun + Probable) into MongoDB
  const seeded = await seedSimulatedMarkets(db);
  console.log(`\x1b[32m✓\x1b[0m Seeded ${seeded} simulated markets (Predict.fun + Probable)`);

  // Sync Opinion Labs markets from real API (with 8s timeout)
  try {
    const opinionFetch = opinion.getMarkets();
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000));
    const opinionMarkets = await Promise.race([opinionFetch, timeout]);
    console.log(`\x1b[32m✓\x1b[0m Opinion Labs: ${opinionMarkets.length} live markets fetched`);
  } catch {
    console.log(`\x1b[33m!\x1b[0m Opinion Labs: using cached markets from DB`);
  }

  // Load all events, register with simulation engine, and start WS price feed
  const allEvents = await getActiveEvents(db);

  // Register all events with simulation engine so price lookups work by any ID
  for (const e of allEvents) {
    registerEventPrice(e.globalEventId, e.platforms);
  }

  const subs = allEvents.flatMap((e: GlobalEvent) => e.platforms.map((p: TokenMapping) => ({
    platform: p.platform as Platform,
    marketId: p.marketId,
    yesTokenId: p.yesTokenId,
    noTokenId: p.noTokenId,
  })));

  priceFeed.start(subs, { opinion: process.env.OPINIONLABS_API_KEY! });
  console.log(`\x1b[32m✓\x1b[0m Price feed active — ${allEvents.length} markets streaming`);

  // Show cross-platform matches
  const multiPlatform = allEvents.filter((e: GlobalEvent) => e.platforms.length > 1);
  const triPlatform = allEvents.filter((e: GlobalEvent) => e.platforms.length === 3);
  console.log(`\x1b[32m✓\x1b[0m Cross-platform: ${multiPlatform.length} matched (${triPlatform.length} on all 3 platforms)`);

  // Show arb opportunities
  const arbCount = allEvents.filter((e: GlobalEvent) => {
    const prices = e.platforms.map((p: TokenMapping) => {
      const cached = priceFeed.get(p.yesTokenId);
      return cached?.bestAsk ?? 1;
    });
    if (prices.length < 2) return false;
    const bestYes = Math.min(...prices);
    const bestNo = 1 - Math.max(...prices);
    return bestYes + bestNo < 0.99;
  }).length;
  if (arbCount > 0) {
    console.log(`\x1b[32m✓\x1b[0m Arb scanner: ${arbCount} opportunities detected`);
  }

  console.log(`\n\x1b[36m  Probly API\x1b[0m \x1b[2m—\x1b[0m \x1b[1mhttp://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[2m  ${allEvents.length} markets | ${multiPlatform.length} cross-platform | Opinion real + Predict/Probable simulated\x1b[0m\n`);
}

app.listen(PORT, () => {
  boot().catch((err) => {
    console.error("Boot failed:", err.message);
    process.exit(1);
  });
});
