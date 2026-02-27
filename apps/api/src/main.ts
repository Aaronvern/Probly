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

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Init adapters
const opinion = new OpinionAdapter(process.env.OPINIONLABS_API_KEY!);
const predict = new PredictAdapter(process.env.PREDICTFUN_API_KEY!);
const probable = new ProbableAdapter();

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "probly-api", timestamp: Date.now() });
});

// Fetch markets from all platforms
app.get("/api/markets", async (_req, res) => {
  try {
    const [opinionMarkets, predictMarkets, probableMarkets] = await Promise.allSettled([
      opinion.getMarkets(),
      predict.getMarkets(),
      probable.getMarkets(),
    ]);

    const markets = {
      opinion: opinionMarkets.status === "fulfilled" ? opinionMarkets.value : [],
      predict: predictMarkets.status === "fulfilled" ? predictMarkets.value : [],
      probable: probableMarkets.status === "fulfilled" ? probableMarkets.value : [],
    };

    const counts = {
      opinion: markets.opinion.length,
      predict: markets.predict.length,
      probable: markets.probable.length,
      total: markets.opinion.length + markets.predict.length + markets.probable.length,
    };

    // Log errors if any
    if (opinionMarkets.status === "rejected") console.error("[Opinion] Error:", opinionMarkets.reason?.message);
    if (predictMarkets.status === "rejected") console.error("[Predict] Error:", predictMarkets.reason?.message);
    if (probableMarkets.status === "rejected") console.error("[Probable] Error:", probableMarkets.reason?.message);

    res.json({ counts, markets });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Startup: smoke test all platforms
async function smokeTest() {
  console.log("\n=== Probly Phase 0: Smoke Test ===\n");

  const adapters = [
    { name: "Opinion Labs", adapter: opinion },
    { name: "Predict.fun", adapter: predict },
    { name: "Probable", adapter: probable },
  ];

  for (const { name, adapter } of adapters) {
    try {
      const markets = await adapter.getMarkets();
      console.log(`✓ ${name}: ${markets.length} markets`);
      if (markets[0]) {
        console.log(`  → "${markets[0].question}" [${markets[0].status}]`);
      }
    } catch (err: any) {
      console.log(`✗ ${name}: ${err.message}`);
    }
  }

  console.log("\n=================================\n");
}

app.listen(PORT, async () => {
  console.log(`Probly API running on http://localhost:${PORT}`);
  await smokeTest();
});
