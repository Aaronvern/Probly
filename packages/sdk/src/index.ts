/**
 * @probly/sdk — Shared SDK for prediction market platform adapters
 *
 * Provides a unified interface across Opinion Labs, Predict.fun, and Probable
 * using the common Gnosis CTF (ERC-1155) pattern.
 */

// Platform adapters
export * from "./adapters/opinion.js";
export * from "./adapters/predict.js";
export * from "./adapters/probable.js";

// Smart Order Router
export * from "./router/index.js";

// Shared types
export * from "./types.js";
