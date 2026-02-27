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
import { aggregateOrderbooks } from "../../../packages/sdk/src/aggregator/index.js";
import { SmartOrderRouter } from "../../../packages/sdk/src/router/index.js";
import type { Platform, PlatformAdapter, TradeIntent } from "../../../packages/sdk/src/types.js";

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

// GET /api/orderbook/:globalEventId — aggregated orderbook with arb detection
app.get("/api/orderbook/:globalEventId", async (req, res) => {
  try {
    const db = (await import("../../../packages/sdk/src/db/mongo.js")).getDB();
    const event = await getEventById(db, req.params.globalEventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const aggregated = await aggregateOrderbooks(event, adaptersMap);
    res.json(aggregated);
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

  // Initial sync
  console.log("\nSyncing markets from all platforms...");
  const result = await matchAndSyncEvents(db, adaptersList);
  console.log(`✓ Synced: ${result.total} events (${result.created} new, ${result.updated} cross-platform)`);

  // Show cross-platform matches
  const events = await getActiveEvents(db);
  const multiPlatform = events.filter((e) => e.platforms.length > 1);
  if (multiPlatform.length > 0) {
    console.log(`\n=== Cross-Platform Matches (${multiPlatform.length}) ===`);
    for (const e of multiPlatform.slice(0, 5)) {
      const platforms = e.platforms.map((p) => p.platform).join(" + ");
      console.log(`  "${e.question}" → [${platforms}]`);
    }
  }

  // Check for arb opportunities on cross-platform events
  if (multiPlatform.length > 0) {
    console.log("\nScanning for arb opportunities...");
    for (const e of multiPlatform.slice(0, 3)) {
      try {
        const agg = await aggregateOrderbooks(e, adaptersMap);
        if (agg.hasArb) {
          console.log(`  🟢 ARB: "${e.question}" — spread: ${(agg.arbSpread! * 100).toFixed(1)}%`);
        }
      } catch {
        // skip failed fetches
      }
    }
  }

  console.log(`\nProbly API ready on http://localhost:${PORT}\n`);
}

app.listen(PORT, () => {
  boot().catch((err) => {
    console.error("Boot failed:", err.message);
    process.exit(1);
  });
});
