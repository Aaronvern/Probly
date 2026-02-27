/**
 * Predict.fun platform adapter
 *
 * REST: https://api.predict.fun
 * WS:   wss://ws.predict.fun/ws
 * SDK:  @predictdotfun/sdk (ethers v6)
 */

import type {
  PlatformAdapter,
  UnifiedMarket,
  UnifiedOrderbook,
  UnifiedPosition,
  Side,
} from "../types.js";

export class PredictAdapter implements PlatformAdapter {
  readonly platform = "predict" as const;

  constructor(
    private readonly apiKey: string,
  ) {}

  async getMarkets(): Promise<UnifiedMarket[]> {
    // TODO: GET /v1/markets
    throw new Error("Not implemented");
  }

  async getOrderbook(tokenId: string): Promise<UnifiedOrderbook> {
    // TODO: GET /v1/markets/{id}/orderbook
    throw new Error("Not implemented");
  }

  async getPrice(tokenId: string, side: Side): Promise<number> {
    // TODO: GET /v1/markets/{id}/last-sale
    throw new Error("Not implemented");
  }

  async getPositions(walletAddress: string): Promise<UnifiedPosition[]> {
    // TODO: GET /v1/positions/{address}
    throw new Error("Not implemented");
  }
}
