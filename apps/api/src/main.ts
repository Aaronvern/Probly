/**
 * Probly API Server
 *
 * Unified backend for the prediction market aggregator.
 * Exposes REST endpoints for the frontend and MCP server.
 */

import express from "express";
import cors from "cors";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "probly-api", timestamp: Date.now() });
});

// TODO: Mount route handlers
// app.use("/api/markets", marketsRouter);
// app.use("/api/orderbook", orderbookRouter);
// app.use("/api/trade", tradeRouter);
// app.use("/api/portfolio", portfolioRouter);
// app.use("/api/arb", arbRouter);

app.listen(PORT, () => {
  console.log(`Probly API running on http://localhost:${PORT}`);
});
