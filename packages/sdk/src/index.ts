/**
 * @probly/sdk — Shared SDK for prediction market platform adapters
 *
 * Provides a unified interface across Opinion Labs, Predict.fun, and Probable
 * using the common Gnosis CTF (ERC-1155) pattern.
 */

// Platform adapters
export { OpinionAdapter } from "./adapters/opinion.js";
export { PredictAdapter } from "./adapters/predict.js";
export { ProbableAdapter } from "./adapters/probable.js";

// Smart Order Router
export { SmartOrderRouter } from "./router/index.js";

// Event matcher
export { matchAndSyncEvents } from "./matcher/index.js";

// Orderbook aggregator
export { aggregateOrderbooks } from "./aggregator/index.js";

// Database
export { connectDB, getDB, closeDB } from "./db/mongo.js";
export { getEventsCollection, getActiveEvents, getEventById, ensureIndexes } from "./db/events.js";
export type { GlobalEvent, TokenMapping } from "./db/events.js";

// Shared types
export * from "./types.js";
