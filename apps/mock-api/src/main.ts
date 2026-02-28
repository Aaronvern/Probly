/**
 * Probly Mock API Server
 *
 * Standalone Express server that mimics the Predict.fun and Probable Markets
 * REST APIs with realistic simulated data. This allows the main Probly API
 * to demonstrate cross-platform aggregation without depending on external
 * services being available.
 *
 * Endpoints:
 *   Predict.fun format:
 *     GET /predict/v1/markets          — list markets
 *     GET /predict/v1/markets/:id/orderbook — market orderbook
 *
 *   Probable format:
 *     GET /probable/events             — list events
 *     GET /probable/book               — token orderbook
 *
 *   Health:
 *     GET /health                      — service health check
 */

import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.MOCK_API_PORT || 3002;

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Seed data (mirrors simulation/index.ts market data)
// ---------------------------------------------------------------------------

interface MockMarket {
  id: number;
  question: string;
  slug: string;
  basePrice: number;
  conditionId: string;
  yesTokenId: string;
  noTokenId: string;
  tags: string[];
}

const MARKETS: MockMarket[] = [
  { id: 2018, question: "Will Bitcoin exceed $100,000 by March 31, 2026?", slug: "btc-100k-march-2026", basePrice: 0.72, conditionId: "0xabc1", yesTokenId: "0xyes_btc100k", noTokenId: "0xno_btc100k", tags: ["crypto", "bitcoin"] },
  { id: 2021, question: "Will Ethereum price exceed $4,000 by March 31, 2026?", slug: "eth-4000-march-2026", basePrice: 0.58, conditionId: "0xabc2", yesTokenId: "0xyes_eth4k", noTokenId: "0xno_eth4k", tags: ["crypto", "ethereum"] },
  { id: 2022, question: "Will BNB reach $800 by end of March 2026?", slug: "bnb-800-march-2026", basePrice: 0.41, conditionId: "0xabc3", yesTokenId: "0xyes_bnb800", noTokenId: "0xno_bnb800", tags: ["crypto", "bnb"] },
  { id: 2025, question: "Will the Federal Reserve cut interest rates in March 2026?", slug: "fed-rate-cut-march-2026", basePrice: 0.35, conditionId: "0xabc4", yesTokenId: "0xyes_fed", noTokenId: "0xno_fed", tags: ["economics"] },
  { id: 2030, question: "Will OpenAI release GPT-5 before April 2026?", slug: "gpt5-release-april-2026", basePrice: 0.28, conditionId: "0xabc5", yesTokenId: "0xyes_gpt5", noTokenId: "0xno_gpt5", tags: ["tech", "ai"] },
  { id: 2033, question: "Will Solana price exceed $300 by March 2026?", slug: "sol-300-march-2026", basePrice: 0.45, conditionId: "0xabc6", yesTokenId: "0xyes_sol300", noTokenId: "0xno_sol300", tags: ["crypto", "solana"] },
  { id: 2036, question: "Will gold price exceed $3,200/oz by March 2026?", slug: "gold-3200-march-2026", basePrice: 0.62, conditionId: "0xabc7", yesTokenId: "0xyes_gold", noTokenId: "0xno_gold", tags: ["commodities"] },
  { id: 2040, question: "Will India win the Champions Trophy 2026?", slug: "india-champions-trophy-2026", basePrice: 0.38, conditionId: "0xabc8", yesTokenId: "0xyes_india", noTokenId: "0xno_india", tags: ["sports", "cricket"] },
  { id: 2042, question: "Will Nvidia stock reach $200 by March 2026?", slug: "nvda-200-march-2026", basePrice: 0.55, conditionId: "0xabc9", yesTokenId: "0xyes_nvda", noTokenId: "0xno_nvda", tags: ["stocks"] },
  { id: 2046, question: "Will a US crypto regulation bill pass in Q1 2026?", slug: "us-crypto-regulation-q1-2026", basePrice: 0.42, conditionId: "0xabc10", yesTokenId: "0xyes_reg", noTokenId: "0xno_reg", tags: ["politics", "crypto"] },
  { id: 2050, question: "Will Dogecoin reach $0.50 by March 2026?", slug: "doge-050-march-2026", basePrice: 0.18, conditionId: "0xabc11", yesTokenId: "0xyes_doge", noTokenId: "0xno_doge", tags: ["crypto", "meme"] },
  { id: 2054, question: "Will Bitcoin dominance exceed 60% by March 2026?", slug: "btc-dominance-60-march-2026", basePrice: 0.48, conditionId: "0xabc12", yesTokenId: "0xyes_btcdom", noTokenId: "0xno_btcdom", tags: ["crypto"] },
  { id: 2058, question: "Will SpaceX launch Starship to orbit in Q1 2026?", slug: "spacex-starship-orbit-q1-2026", basePrice: 0.52, conditionId: "0xabc13", yesTokenId: "0xyes_spacex", noTokenId: "0xno_spacex", tags: ["tech", "space"] },
  { id: 2060, question: "Will Cardano exceed $2 by March 2026?", slug: "ada-2-march-2026", basePrice: 0.15, conditionId: "0xabc14", yesTokenId: "0xyes_ada", noTokenId: "0xno_ada", tags: ["crypto"] },
  { id: 2064, question: "Will a Bitcoin ETF be approved in India by March 2026?", slug: "btc-etf-india-march-2026", basePrice: 0.08, conditionId: "0xabc15", yesTokenId: "0xyes_btcetf", noTokenId: "0xno_btcetf", tags: ["crypto", "regulation"] },
];

// Token ID lookup
const tokenToMarket = new Map<string, MockMarket>();
for (const m of MARKETS) {
  tokenToMarket.set(m.yesTokenId, m);
  tokenToMarket.set(m.noTokenId, m);
  tokenToMarket.set(String(m.id), m);
}

// ---------------------------------------------------------------------------
// Price simulation with jitter
// ---------------------------------------------------------------------------

function getPrice(basePrice: number, platformOffset: number): number {
  const timeFactor = Math.floor(Date.now() / 3000);
  const jitter = Math.sin(timeFactor * 1.7 + basePrice * 100 + platformOffset * 1000) * 0.015;
  return Math.max(0.01, Math.min(0.99, basePrice + platformOffset + jitter));
}

function generateOrderbookLevels(fairPrice: number): {
  bids: [number, number][];
  asks: [number, number][];
} {
  const spread = 0.005 + Math.random() * 0.01;
  const bestAsk = Math.min(0.99, fairPrice + spread / 2);
  const bestBid = Math.max(0.01, fairPrice - spread / 2);
  const levels = 5 + Math.floor(Math.random() * 4);

  const asks: [number, number][] = [];
  const bids: [number, number][] = [];

  for (let i = 0; i < levels; i++) {
    asks.push([
      Math.round((bestAsk + i * 0.01) * 1000) / 1000,
      Math.round((50 + Math.random() * 500) * 100) / 100,
    ]);
    bids.push([
      Math.round((bestBid - i * 0.01) * 1000) / 1000,
      Math.round((50 + Math.random() * 500) * 100) / 100,
    ]);
  }

  return { bids, asks };
}

// ---------------------------------------------------------------------------
// Predict.fun compatible endpoints
// ---------------------------------------------------------------------------

// GET /predict/v1/markets
app.get("/predict/v1/markets", (_req, res) => {
  const data = MARKETS.map((m) => ({
    id: m.id,
    title: m.question,
    question: m.question,
    description: `Resolution: ${m.question}`,
    imageUrl: "",
    tradingStatus: "OPEN",
    status: "ACTIVE",
    conditionId: m.conditionId,
    categorySlug: m.slug,
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    outcomes: [
      { name: "Yes", indexSet: 1, onChainId: m.yesTokenId, status: "ACTIVE" },
      { name: "No", indexSet: 2, onChainId: m.noTokenId, status: "ACTIVE" },
    ],
    feeRateBps: 100,
  }));
  res.json({ success: true, data });
});

// GET /predict/v1/markets/:id/orderbook
app.get("/predict/v1/markets/:id/orderbook", (req, res) => {
  const market = tokenToMarket.get(req.params.id);
  if (!market) {
    res.status(404).json({ success: false, message: "Market not found" });
    return;
  }
  const price = getPrice(market.basePrice, 0.015);
  const { bids, asks } = generateOrderbookLevels(price);
  res.json({ success: true, data: { marketId: market.id, bids, asks } });
});

// ---------------------------------------------------------------------------
// Probable Markets compatible endpoints
// ---------------------------------------------------------------------------

// GET /probable/events
app.get("/probable/events", (_req, res) => {
  const events = MARKETS.map((m) => ({
    id: m.slug,
    slug: m.slug,
    title: m.question,
    active: true,
    closed: false,
    archived: false,
    liquidity: String(Math.floor(5000 + Math.random() * 50000)),
    volume: String(Math.floor(10000 + Math.random() * 90000)),
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    markets: [{
      id: m.slug + "-mkt",
      condition_id: m.conditionId,
      question: m.question,
      question_id: m.slug,
      market_slug: m.slug,
      outcomes: JSON.stringify(["Yes", "No"]),
      clobTokenIds: JSON.stringify([m.yesTokenId, m.noTokenId]),
      active: true,
      closed: false,
      startDate: new Date(Date.now() - 5 * 86400000).toISOString(),
      endDate: new Date("2026-03-31T23:59:59Z").toISOString(),
      tokens: [
        { token_id: m.yesTokenId, outcome: "Yes" },
        { token_id: m.noTokenId, outcome: "No" },
      ],
      description: `Resolution: ${m.question}`,
      volume24hr: String(Math.floor(1000 + Math.random() * 10000)),
      liquidity: String(Math.floor(2000 + Math.random() * 20000)),
    }],
    tags: m.tags.map((t, i) => ({ id: i + 1, label: t, slug: t })),
  }));
  res.json(events);
});

// GET /probable/book
app.get("/probable/book", (req, res) => {
  const tokenId = req.query.token_id as string;
  if (!tokenId) {
    res.status(400).json({ error: "Missing token_id" });
    return;
  }
  const market = tokenToMarket.get(tokenId);
  const basePrice = market?.basePrice ?? 0.5;
  const isNo = tokenId.includes("no_");
  const price = getPrice(isNo ? 1 - basePrice : basePrice, -0.012);
  const spread = 0.005 + Math.random() * 0.01;
  const bestAsk = Math.min(0.99, price + spread / 2);
  const bestBid = Math.max(0.01, price - spread / 2);
  const levels = 6;

  const asks = Array.from({ length: levels }, (_, i) => ({
    price: String(Math.round((bestAsk + i * 0.01) * 1000) / 1000),
    size: String(Math.round((50 + Math.random() * 500) * 100) / 100),
  }));
  const bids = Array.from({ length: levels }, (_, i) => ({
    price: String(Math.round((bestBid - i * 0.01) * 1000) / 1000),
    size: String(Math.round((50 + Math.random() * 500) * 100) / 100),
  }));

  res.json({ bids, asks });
});

// GET /probable/price
app.get("/probable/price", (req, res) => {
  const tokenId = req.query.token_id as string;
  const market = tokenToMarket.get(tokenId ?? "");
  const basePrice = market?.basePrice ?? 0.5;
  const isNo = (tokenId ?? "").includes("no_");
  const price = getPrice(isNo ? 1 - basePrice : basePrice, -0.012);
  res.json({ price: String(Math.round(price * 1000) / 1000) });
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "probly-mock-api",
    markets: MARKETS.length,
    timestamp: Date.now(),
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`\x1b[36m  Probly Mock API\x1b[0m \x1b[2m—\x1b[0m \x1b[1mhttp://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[2m  Serving ${MARKETS.length} simulated markets (Predict.fun + Probable format)\x1b[0m`);
  console.log(`\x1b[2m  Predict: /predict/v1/markets | Probable: /probable/events\x1b[0m\n`);
});
