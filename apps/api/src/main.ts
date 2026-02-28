/**
 * Probly API Server
 *
 * Unified backend for the prediction market aggregator.
 */

import express from "express";
import cors from "cors";
import "dotenv/config";
import { OpinionAdapter } from "../../../packages/sdk/src/adapters/opinion.js";
import { PredictAdapter } from "../../../packages/sdk/src/adapters/predict.js";
import { ProbableAdapter } from "../../../packages/sdk/src/adapters/probable.js";
import { connectDB } from "../../../packages/sdk/src/db/mongo.js";
import { ensureIndexes, getActiveEvents, getEventById } from "../../../packages/sdk/src/db/events.js";
import { matchAndSyncEvents } from "../../../packages/sdk/src/matcher/index.js";
import { aggregateOrderbooks, buildAggFromCache } from "../../../packages/sdk/src/aggregator/index.js";
import { PriceFeed } from "../../../packages/sdk/src/ws/price-feed.js";
import { SmartOrderRouter } from "../../../packages/sdk/src/router/index.js";
import type { Platform, PlatformAdapter, TradeIntent } from "../../../packages/sdk/src/types.js";
import { GhostEngine } from "../../../packages/sdk/src/ghost/index.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Init adapters
const opinion = new OpinionAdapter(process.env.OPINIONLABS_API_KEY!);
const predict = new PredictAdapter(process.env.PREDICTFUN_API_KEY!);
const probable = new ProbableAdapter();

const adaptersList: PlatformAdapter[] = [opinion, predict, probable];
const adaptersMap = new Map<Platform, PlatformAdapter>([
  ["opinion", opinion],
  ["predict", predict],
  ["probable", probable],
]);

// Init Smart Order Router
const sor = new SmartOrderRouter();
for (const adapter of adaptersList) sor.registerAdapter(adapter);

// Ghost Market Engine (started in boot after DB is ready)
let ghostEngine: GhostEngine | null = null;

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
      events: events.map((e) => ({
        globalEventId: e.globalEventId,
        question: e.question,
        slug: e.slug,
        status: e.status,
        platformCount: e.platforms.length,
        platforms: e.platforms.map((p) => p.platform),
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

    const results = await Promise.all(events.map(async (event) => {
      // Use WS cache if ANY non-Opinion platform has fresh data.
      // buildAggFromCache handles missing platforms gracefully (defaults to ask=1, bid=0).
      const hasWsData = event.platforms.some(p =>
        p.platform !== "opinion" && priceFeed.isFresh(p.yesTokenId, CACHE_MAX_AGE),
      );

      if (hasWsData) {
        const agg = buildAggFromCache(event, priceFeed);
        const platformPrices: Record<string, { yes: number | null; no: number | null }> = {};
        for (const p of event.platforms) {
          const yesCache = priceFeed.get(p.yesTokenId);
          const noCache = priceFeed.get(p.noTokenId);
          platformPrices[p.platform] = {
            yes: yesCache ? yesCache.bestAsk : null,
            no: noCache ? noCache.bestAsk : null,
          };
        }
        return {
          globalEventId: event.globalEventId,
          question: event.question,
          platforms: event.platforms.map(p => p.platform),
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
      const nonOpinionPlatforms = event.platforms.filter(p => p.platform !== "opinion");
      if (nonOpinionPlatforms.length === 0) {
        // Opinion-only market: return last WS price if any, else pending
        const cachedAgg = buildAggFromCache(event, priceFeed);
        const hasAnyPrice = cachedAgg.yes.bestAsk?.price < 1 || cachedAgg.no.bestAsk?.price < 1;
        return {
          globalEventId: event.globalEventId,
          question: event.question,
          platforms: event.platforms.map(p => p.platform),
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
          platforms: event.platforms.map(p => p.platform),
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
          platforms: event.platforms.map(p => p.platform),
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
    const allFresh = event.platforms.some(p =>
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
        legs: route.legs.map((l) => ({
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

// POST /api/trade/execute — execute a routed trade
// Body: same as /quote — quotes then immediately executes
app.post("/api/trade/execute", async (req, res) => {
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

    const intent: TradeIntent = { globalEventId, outcome, side, amount, maxSlippage };
    const route = await sor.quote(intent, event);
    const result = await sor.execute(route);

    res.json({
      globalEventId,
      question: event.question,
      success: result.success,
      totalSpent: result.totalSpent,
      legs: result.legs.map((l) => ({
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

// GET /api/portfolio/:address — cross-platform positions and PnL
app.get("/api/portfolio/:address", async (req, res) => {
  try {
    const { address } = req.params;
    if (!address) {
      res.status(400).json({ error: "Missing wallet address" });
      return;
    }
    const results = await Promise.allSettled(
      adaptersList.map(a => a.getPositions(address)),
    );
    const positions = results.flatMap((r) =>
      r.status === "fulfilled" ? r.value : [],
    );
    res.json({ address, positions, count: positions.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Ghost Market API ──────────────────────────────────────────────────────────

// GET /api/ghost-markets — list ghost markets (pending AI-predicted markets)
// Query params: ?status=ghost|matched|rejected&limit=50
app.get("/api/ghost-markets", async (req, res) => {
  try {
    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    const status = (req.query.status as string) || "ghost";
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const ghosts = await db.collection("ghost_markets")
      .find({ status })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    res.json({
      count: ghosts.length,
      status,
      ghosts: ghosts.map((g) => ({
        id: String(g._id),
        question: g.question,
        category: g.category,
        confidence: g.confidence,
        resolutionDate: g.resolutionDate,
        resolutionSource: g.resolutionSource,
        status: g.status,
        globalEventId: g.globalEventId ?? null,
        resolutionRisk: g.resolutionRisk ?? null,
        similarityScore: g.similarityScore ?? null,
        matchedAt: g.matchedAt ?? null,
        createdAt: g.createdAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ghost-markets/process — manually trigger article processing
app.post("/api/ghost-markets/process", async (_req, res) => {
  try {
    if (!ghostEngine) {
      res.status(503).json({ error: "GhostEngine not started" });
      return;
    }
    const created = await ghostEngine.processNow();
    res.json({ success: true, created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events — recent news articles as event calendar feed
// Queries news_articles from MongoDB, filters for event-signal keywords
app.get("/api/events", async (req, res) => {
  try {
    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);

    const EVENT_KEYWORDS = [
      "summit", "conference", "hearing", "decision", "expiry", "expiration",
      "launch", "upgrade", "report", "meeting", "vote", "election", "deadline",
      "announce", "release", "ruling", "verdict", "regulation", "ban", "approval",
      "etf", "fomc", "fed", "cpi", "gdp", "nfp", "payroll",
    ];

    const keywordRegex = EVENT_KEYWORDS.join("|");

    const articles = await db
      .collection("news_articles")
      .find({
        headline: { $regex: keywordRegex, $options: "i" },
      })
      .sort({ fetchedAt: -1 })
      .limit(limit)
      .toArray();

    res.json({
      count: articles.length,
      events: articles.map((a) => ({
        id: a._id?.toString(),
        headline: a.headline,
        source: a.source,
        category: a.category,
        url: a.url,
        fetchedAt: a.fetchedAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync — trigger market sync across all platforms
app.post("/api/sync", async (_req, res) => {
  try {
    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    const result = await matchAndSyncEvents(db, adaptersList);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Startup
async function boot() {
  // Connect to MongoDB
  const db = await connectDB(process.env.MONGODB_URI!);
  await ensureIndexes(db);

  // FIX 1: Start WS feed FIRST using whatever is already in DB,
  // so it begins warming up in parallel with the REST sync below.
  const existingEvents = await getActiveEvents(db);
  if (existingEvents.length > 0) {
    priceFeed.start(
      existingEvents.flatMap(e => e.platforms.map(p => ({
        platform: p.platform as any,
        marketId: p.marketId,
        yesTokenId: p.yesTokenId,
        noTokenId: p.noTokenId,
      }))),
      { opinion: process.env.OPINIONLABS_API_KEY! },
    );
    console.log(`✓ WS price feed started early — ${existingEvents.length} markets from DB cache`);
  }

  // FIX 2: Sync markets (REST calls to all platforms) — WS already warming in background.
  // FIX 2: Removed arb scan — it burns Opinion rate limit with parallel REST calls on startup.
  console.log("Syncing markets from all platforms...");
  const result = await matchAndSyncEvents(db, adaptersList);
  console.log(`✓ Synced: ${result.total} events (${result.created} new, ${result.updated} cross-platform)`);

  // Subscribe any newly synced markets to the WS feed without restarting
  if (result.created > 0) {
    const freshEvents = await getActiveEvents(db);
    const existingIds = new Set(existingEvents.map(e => e.globalEventId));
    const newSubs = freshEvents
      .filter(e => !existingIds.has(e.globalEventId))
      .flatMap(e => e.platforms.map(p => ({
        platform: p.platform as any,
        marketId: p.marketId,
        yesTokenId: p.yesTokenId,
        noTokenId: p.noTokenId,
      })));
    if (newSubs.length > 0) {
      priceFeed.addSubscriptions(newSubs);
      console.log(`✓ WS feed: added ${newSubs.length} new market subscriptions`);
    }
  }

  const multiPlatform = (await getActiveEvents(db)).filter(e => e.platforms.length > 1);
  if (multiPlatform.length > 0) {
    console.log(`\n=== Cross-Platform Matches (${multiPlatform.length}) ===`);
    for (const e of multiPlatform.slice(0, 5)) {
      console.log(`  "${e.question}" → [${e.platforms.map(p => p.platform).join(" + ")}]`);
    }
  }

  // Start Ghost Market Engine (predictive + reactive tracks)
  ghostEngine = new GhostEngine(db);
  ghostEngine.start();
  console.log("✓ Ghost Market Engine started");

  console.log(`\nProbly API ready on http://localhost:${PORT}\n`);
}

app.listen(PORT, () => {
  boot().catch((err) => {
    console.error("Boot failed:", err.message);
    process.exit(1);
  });
});
