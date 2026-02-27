/**
 * Probable Markets platform adapter
 *
 * REST: https://api.probable.markets/public/api/v1
 * WS:   wss://api.probable.markets/ws?chainId=56
 * SDK:  @prob/clob (viem)
 */

import type {
  PlatformAdapter,
  UnifiedMarket,
  UnifiedOrderbook,
  UnifiedPosition,
  Side,
} from "../types.js";

export class ProbableAdapter implements PlatformAdapter {
  readonly platform = "probable" as const;

  constructor(
    private readonly credentials: {
      key: string;
      secret: string;
      passphrase: string;
    },
  ) {}

  async getMarkets(): Promise<UnifiedMarket[]> {
    // TODO: GET /events via @prob/clob createClobClient().getEvents()
    throw new Error("Not implemented");
  }

  async getOrderbook(tokenId: string): Promise<UnifiedOrderbook> {
    // TODO: GET /book?token_id={tokenId}
    throw new Error("Not implemented");
  }

  async getPrice(tokenId: string, side: Side): Promise<number> {
    // TODO: GET /price?token_id={tokenId}&side={side}
    throw new Error("Not implemented");
  }

  async getPositions(walletAddress: string): Promise<UnifiedPosition[]> {
    // TODO: GET /position/current?user={address}
    throw new Error("Not implemented");
  }
}
