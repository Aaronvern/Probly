/**
 * Probly MCP Server
 *
 * Exposes Probly's prediction market aggregator to Claude via MCP.
 * Claude can autonomously analyze markets, route trades, and fetch portfolios.
 *
 * Tools:
 *  - analyze_markets   — scan unified orderbook for best opportunities + arb
 *  - get_quote         — get SOR routing plan for a trade intent
 *  - execute_trade     — execute a trade via the Smart Order Router
 *  - get_portfolio     — fetch cross-platform positions and PnL
 *
 * Usage: npx tsx apps/mcp-server/src/main.ts
 * Add to Claude Desktop: see README for config
 */

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { OpinionAdapter } from "../../../packages/sdk/src/adapters/opinion.js";
import { PredictAdapter } from "../../../packages/sdk/src/adapters/predict.js";
import { ProbableAdapter } from "../../../packages/sdk/src/adapters/probable.js";
import { SmartOrderRouter } from "../../../packages/sdk/src/router/index.js";
import { connectDB } from "../../../packages/sdk/src/db/mongo.js";
import { ensureIndexes, getActiveEvents, getEventById } from "../../../packages/sdk/src/db/events.js";
import { matchAndSyncEvents } from "../../../packages/sdk/src/matcher/index.js";
import { aggregateOrderbooks, buildAggFromCache } from "../../../packages/sdk/src/aggregator/index.js";
import { PriceFeed } from "../../../packages/sdk/src/ws/price-feed.js";
import type { Platform, PlatformAdapter } from "../../../packages/sdk/src/types.js";

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

const opinion = new OpinionAdapter(process.env.OPINIONLABS_API_KEY!);
const predict = new PredictAdapter(process.env.PREDICTFUN_API_KEY!);
const probable = new ProbableAdapter();
const adapters: PlatformAdapter[] = [opinion, predict, probable];

const adaptersMap = new Map<Platform, PlatformAdapter>([
  ["opinion", opinion],
  ["predict", predict],
  ["probable", probable],
]);

const sor = new SmartOrderRouter();
for (const a of adapters) sor.registerAdapter(a);

const priceFeed = new PriceFeed();

let dbReady = false;
async function getDB() {
  const { connectDB: connect, getDB: db } = await import("../../../packages/sdk/src/db/mongo.js");
  if (!dbReady) {
    await connect(process.env.MONGODB_URI!);
    const { ensureIndexes: idx } = await import("../../../packages/sdk/src/db/events.js");
    const { getDB: g } = await import("../../../packages/sdk/src/db/mongo.js");
    await idx(g());
    dbReady = true;
  }
  const { getDB: g } = await import("../../../packages/sdk/src/db/mongo.js");
  return g();
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "probly",
  version: "1.0.0",
});

// ── Tool: analyze_markets ──────────────────────────────────────────────────

server.tool(
  "analyze_markets",
  "Scan all active prediction markets across Opinion Labs, Predict.fun, and Probable. Returns best YES/NO prices per platform, arbitrage opportunities (where YES+NO < 1.00 across platforms), and top markets by volume. Use this to find the best trading opportunities.",
  {
    limit: z.number().optional().describe("Max number of markets to return (default 10)"),
    arb_only: z.boolean().optional().describe("If true, only return markets with arbitrage opportunities"),
  },
  async ({ limit = 10, arb_only = false }) => {
    try {
      const db = await getDB();
      await matchAndSyncEvents(db, adapters);
      const events = await getActiveEvents(db);

      // Start WS price feed on first call (subscribes to all active markets)
      if (priceFeed.size === 0) {
        priceFeed.start(
          events.flatMap(e => e.platforms.map(p => ({
            platform: p.platform as any,
            marketId: p.marketId,
            yesTokenId: p.yesTokenId,
            noTokenId: p.noTokenId,
          }))),
          { opinion: process.env.OPINIONLABS_API_KEY! },
        );
      }

      const results = [];
      for (const event of events.slice(0, Math.min(events.length, 30))) {
        try {
          // Fast path: read from WS price cache if any non-Opinion platform has fresh data
          const hasWsData = event.platforms.some(p =>
            p.platform !== "opinion" && priceFeed.isFresh(p.yesTokenId),
          );
          let agg;
          if (hasWsData) {
            // Build aggregated view directly from in-memory cache
            agg = buildAggFromCache(event, priceFeed);
          } else {
            // Fallback: REST fetch and populate cache
            agg = await aggregateOrderbooks(event, adaptersMap);
          }
          if (arb_only && !agg.hasArb) continue;
          results.push({
            globalEventId: event.globalEventId,
            question: event.question,
            platforms: event.platforms.map((p: any) => p.platform),
            yes: {
              bestAsk: agg.yes.bestAsk?.price,
              bestAskPlatform: agg.yes.bestAsk?.platform,
              bestBid: agg.yes.bestBid?.price,
            },
            no: {
              bestAsk: agg.no.bestAsk?.price,
              bestAskPlatform: agg.no.bestAsk?.platform,
            },
            hasArb: agg.hasArb,
            arbSpread: agg.arbSpread ? `${(agg.arbSpread * 100).toFixed(2)}%` : null,
          });
          if (results.length >= limit) break;
        } catch {
          // skip markets where orderbook fetch fails
        }
      }

      const arbCount = results.filter(r => r.hasArb).length;

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            summary: `Found ${results.length} markets across ${events.length} total. ${arbCount} arb opportunities detected.`,
            markets: results,
          }, null, 2),
        }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// ── Tool: get_quote ────────────────────────────────────────────────────────

server.tool(
  "get_quote",
  "Get the optimal trade routing plan from the Smart Order Router. Shows which platform(s) to use, how much to allocate to each, expected price, and estimated shares. Always call this before execute_trade.",
  {
    global_event_id: z.string().describe("The globalEventId from analyze_markets"),
    outcome: z.enum(["YES", "NO"]).describe("Which outcome to bet on"),
    side: z.enum(["BUY", "SELL"]).describe("BUY to enter position, SELL to exit"),
    amount: z.number().describe("USDT amount to trade"),
  },
  async ({ global_event_id, outcome, side, amount }) => {
    try {
      const db = await getDB();
      const event = await getEventById(db, global_event_id);
      if (!event) return { content: [{ type: "text" as const, text: `Event ${global_event_id} not found` }], isError: true };

      const route = await sor.quote(
        { globalEventId: global_event_id, outcome, side, amount },
        event,
      );

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            question: event.question,
            intent: { outcome, side, amount },
            route: {
              legs: route.legs.map(l => ({
                platform: l.platform,
                amount: l.amount,
                allocationPct: `${((l.amount / route.totalCost) * 100).toFixed(1)}%`,
                expectedPrice: l.expectedPrice,
                expectedShares: l.expectedShares.toFixed(2),
              })),
              weightedAvgPrice: route.weightedAvgPrice.toFixed(4),
              estimatedShares: route.estimatedShares.toFixed(2),
              totalCost: route.totalCost,
            },
          }, null, 2),
        }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// ── Tool: execute_trade ────────────────────────────────────────────────────

server.tool(
  "execute_trade",
  "Execute a prediction market trade via Probly's Smart Order Router. Routes to the best platform automatically. Opinion Labs trades are executed on BSC mainnet. Other platforms use simulation for the demo.",
  {
    global_event_id: z.string().describe("The globalEventId from analyze_markets"),
    outcome: z.enum(["YES", "NO"]).describe("Which outcome to bet on"),
    side: z.enum(["BUY", "SELL"]).describe("BUY to enter, SELL to exit"),
    amount: z.number().describe("USDT amount to trade"),
    max_slippage: z.number().optional().describe("Max slippage tolerance 0-1 (default 0.05 = 5%)"),
  },
  async ({ global_event_id, outcome, side, amount, max_slippage = 0.05 }) => {
    try {
      const db = await getDB();
      const event = await getEventById(db, global_event_id);
      if (!event) return { content: [{ type: "text" as const, text: `Event ${global_event_id} not found` }], isError: true };

      const route = await sor.quote(
        { globalEventId: global_event_id, outcome, side, amount, maxSlippage: max_slippage },
        event,
      );
      const result = await sor.execute(route);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            question: event.question,
            success: result.success,
            totalSpent: result.totalSpent,
            legs: result.legs.map(l => ({
              platform: l.platform,
              amount: l.amount,
              expectedPrice: l.expectedPrice,
              orderId: l.orderId,
              simulated: l.simulated,
              ...(l.error ? { note: l.error } : {}),
            })),
          }, null, 2),
        }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// ── Tool: get_portfolio ────────────────────────────────────────────────────

server.tool(
  "get_portfolio",
  "Fetch cross-platform positions and PnL for a wallet address across Opinion Labs, Predict.fun, and Probable.",
  {
    wallet_address: z.string().describe("EVM wallet address (0x...)"),
  },
  async ({ wallet_address }) => {
    try {
      const results = await Promise.allSettled(
        adapters.map(a => a.getPositions(wallet_address)),
      );

      const positions = results.flatMap((r, i) => {
        if (r.status !== "fulfilled") return [];
        return r.value.map(p => ({ ...p, platform: adapters[i].platform }));
      });

      const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            wallet: wallet_address,
            totalPositions: positions.length,
            totalPnl: totalPnl.toFixed(2),
            positions: positions.map(p => ({
              platform: p.platform,
              question: p.question,
              outcome: p.outcome,
              shares: p.shares,
              avgEntryPrice: p.avgEntryPrice,
              currentPrice: p.currentPrice,
              pnl: p.pnl.toFixed(2),
              pnlPct: `${p.pnlPercent.toFixed(1)}%`,
            })),
          }, null, 2),
        }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Probly MCP Server running on stdio");
