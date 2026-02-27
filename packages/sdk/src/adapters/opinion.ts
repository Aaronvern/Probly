/**
 * Opinion Labs platform adapter
 *
 * REST: https://openapi.opinion.trade/openapi
 * WS:   wss://ws.opinion.trade?apikey={KEY}
 * SDK:  @opinion-labs/opinion-clob-sdk (viem, ESM)
 */

import type {
  PlatformAdapter,
  UnifiedMarket,
  UnifiedOrderbook,
  UnifiedPosition,
  Side,
} from "../types.js";

export class OpinionAdapter implements PlatformAdapter {
  readonly platform = "opinion" as const;

  constructor(
    private readonly apiKey: string,
    private readonly rpcUrl: string,
  ) {}

  async getMarkets(): Promise<UnifiedMarket[]> {
    // TODO: Implement via opinion-clob-sdk or REST API
    throw new Error("Not implemented");
  }

  async getOrderbook(tokenId: string): Promise<UnifiedOrderbook> {
    // TODO: GET /token/orderbook?token_id={tokenId}
    throw new Error("Not implemented");
  }

  async getPrice(tokenId: string, side: Side): Promise<number> {
    // TODO: GET /token/latest-price?token_id={tokenId}
    throw new Error("Not implemented");
  }

  async getPositions(walletAddress: string): Promise<UnifiedPosition[]> {
    // TODO: GET /positions/user/{walletAddress}
    throw new Error("Not implemented");
  }
}
