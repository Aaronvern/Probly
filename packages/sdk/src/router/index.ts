/**
 * Smart Order Router (SOR)
 *
 * Two-step flow:
 *  1. quote()   — fetches live prices, computes Meta-Bet Consensus Split
 *  2. execute() — sends each leg to the appropriate platform
 *
 * Meta-Bet Split algorithm:
 *  - If best platform is >2% cheaper than next → route 100% there
 *  - Otherwise → inverse-price-weighted split across cheapest platforms
 */

import { Client as OpinionClient } from "@opinion-labs/opinion-clob-sdk";
import { OrderSide, OrderType } from "@opinion-labs/opinion-clob-sdk/dist/models/enums.js";
import type {
  PlatformAdapter,
  TradeIntent,
  RouteResult,
  RouteLeg,
  Platform,
} from "../types.js";
import type { GlobalEvent } from "../db/events.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuoteInput {
  intent: TradeIntent;
  event: GlobalEvent;
}

export interface ExecutionLeg {
  platform: Platform;
  tokenId: string;
  amount: number;
  expectedPrice: number;
  /** Order/tx ID from the platform, or null if simulated */
  orderId: string | null;
  simulated: boolean;
  error?: string;
}

export interface ExecutionResult {
  globalEventId: string;
  legs: ExecutionLeg[];
  totalSpent: number;
  success: boolean;
}

// ---------------------------------------------------------------------------
// Smart Order Router
// ---------------------------------------------------------------------------

export class SmartOrderRouter {
  private adapters: Map<Platform, PlatformAdapter> = new Map();

  registerAdapter(adapter: PlatformAdapter): void {
    this.adapters.set(adapter.platform, adapter);
  }

  /**
   * Compute optimal route for a trade intent.
   * Returns a RouteResult with legs showing how to split the order.
   */
  async quote(intent: TradeIntent, event: GlobalEvent): Promise<RouteResult> {
    const { outcome, side, amount } = intent;

    // Fetch best price from each platform that has this event
    const priceResults = await Promise.allSettled(
      event.platforms.map(async (mapping) => {
        const adapter = this.adapters.get(mapping.platform);
        if (!adapter) return null;

        const tokenId = outcome === "YES" ? mapping.yesTokenId : mapping.noTokenId;
        if (!tokenId) return null;

        const price = await adapter.getPrice(tokenId, side);
        return { platform: mapping.platform, tokenId, price };
      }),
    );

    // Collect valid price quotes
    const quotes: { platform: Platform; tokenId: string; price: number }[] = [];
    for (const r of priceResults) {
      if (r.status === "fulfilled" && r.value && r.value.price > 0) {
        quotes.push(r.value);
      }
    }

    if (quotes.length === 0) {
      throw new Error(`No live prices available for event ${event.globalEventId}`);
    }

    // Sort: BUY → ascending (cheapest first), SELL → descending (highest first)
    quotes.sort((a, b) => side === "BUY" ? a.price - b.price : b.price - a.price);

    const legs = this.computeSplit(quotes, amount, side);
    const totalCost = legs.reduce((s, l) => s + l.amount, 0);
    const weightedAvgPrice = legs.reduce((s, l) => s + l.expectedPrice * (l.amount / totalCost), 0);
    const estimatedShares = legs.reduce((s, l) => s + l.expectedShares, 0);

    return { intent, legs, totalCost, weightedAvgPrice, estimatedShares };
  }

  /**
   * Execute a quoted route. Attempts real execution on Opinion Labs;
   * other platforms return simulated results for the hackathon demo.
   */
  async execute(route: RouteResult): Promise<ExecutionResult> {
    const execLegs = await Promise.allSettled(
      route.legs.map((leg) => this.executeLeg(leg)),
    );

    const legs: ExecutionLeg[] = execLegs.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return {
        platform: route.legs[i].platform,
        tokenId: route.legs[i].tokenId,
        amount: route.legs[i].amount,
        expectedPrice: route.legs[i].expectedPrice,
        orderId: null,
        simulated: true,
        error: (r as PromiseRejectedResult).reason?.message,
      };
    });

    return {
      globalEventId: route.intent.globalEventId,
      legs,
      totalSpent: legs.reduce((s, l) => s + l.amount, 0),
      success: legs.some((l) => !l.error),
    };
  }

  // ---------------------------------------------------------------------------
  // Meta-Bet split logic
  // ---------------------------------------------------------------------------

  private computeSplit(
    quotes: { platform: Platform; tokenId: string; price: number }[],
    amount: number,
    side: "BUY" | "SELL",
  ): RouteLeg[] {
    if (quotes.length === 1) {
      return [this.makeLeg(quotes[0], amount)];
    }

    const best = quotes[0];
    const second = quotes[1];

    // If best platform is >2% cheaper → route 100% there
    const priceDiff = Math.abs(best.price - second.price);
    if (priceDiff / second.price > 0.02) {
      return [this.makeLeg(best, amount)];
    }

    // Otherwise: inverse-price-weighted split across all platforms
    // (cheaper price → larger weight → more allocation)
    const weights = quotes.map((q) => 1 / q.price);
    const totalWeight = weights.reduce((s, w) => s + w, 0);

    return quotes.map((q, i) => {
      const alloc = Math.round((weights[i] / totalWeight) * amount * 100) / 100;
      return this.makeLeg(q, alloc);
    });
  }

  private makeLeg(
    q: { platform: Platform; tokenId: string; price: number },
    amount: number,
  ): RouteLeg {
    return {
      platform: q.platform,
      tokenId: q.tokenId,
      side: "BUY",
      amount,
      expectedPrice: q.price,
      expectedShares: amount / q.price,
    };
  }

  // ---------------------------------------------------------------------------
  // Platform execution
  // ---------------------------------------------------------------------------

  private async executeLeg(leg: RouteLeg): Promise<ExecutionLeg> {
    switch (leg.platform) {
      case "opinion":
        return this.executeOpinion(leg);
      case "probable":
        return this.executeProbable(leg);
      case "predict":
        return this.executePredict(leg);
      default:
        return this.simulateLeg(leg, "Unknown platform");
    }
  }

  private async executeOpinion(leg: RouteLeg): Promise<ExecutionLeg> {
    const privateKey = process.env.PRIVATE_KEY;
    const apiKey = process.env.OPINIONLABS_API_KEY;
    const multiSigAddress = process.env.OPINIONLABS_MULTISIG;
    const rpcUrl = process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org/";

    if (!privateKey || !apiKey || !multiSigAddress) {
      return this.simulateLeg(leg, "Opinion: missing PRIVATE_KEY / OPINIONLABS_API_KEY / OPINIONLABS_MULTISIG");
    }

    try {
      const client = new OpinionClient({
        host: "https://openapi.opinion.trade/openapi",
        apiKey,
        chainId: 56,
        rpcUrl,
        privateKey: privateKey as `0x${string}`,
        multiSigAddress: multiSigAddress as `0x${string}`,
      });

      const result = await client.placeOrder({
        marketId: Number(leg.tokenId.split("-")[0] ?? 0), // tokenId format: marketId-outcome
        tokenId: leg.tokenId,
        side: leg.side === "BUY" ? OrderSide.BUY : OrderSide.SELL,
        orderType: OrderType.MARKET_ORDER,
        price: leg.expectedPrice.toFixed(4),
        makerAmountInQuoteToken: leg.amount.toFixed(2),
      });

      const orderId = (result.result as any)?.orderId ?? null;
      return { platform: "opinion", tokenId: leg.tokenId, amount: leg.amount, expectedPrice: leg.expectedPrice, orderId, simulated: false };
    } catch (err: any) {
      // Fall back to simulation if execution fails
      return this.simulateLeg(leg, `Opinion exec failed: ${err.message}`);
    }
  }

  private async executeProbable(leg: RouteLeg): Promise<ExecutionLeg> {
    // Probable requires L1 EIP-712 → L2 HMAC auth with wallet client
    // Full implementation requires Biconomy session key — simulated for now
    return this.simulateLeg(leg, null);
  }

  private async executePredict(leg: RouteLeg): Promise<ExecutionLeg> {
    // Predict.fun requires JWT from wallet signature — simulated for now
    return this.simulateLeg(leg, null);
  }

  private simulateLeg(leg: RouteLeg, reason: string | null): ExecutionLeg {
    // Generate a deterministic fake order ID for the demo
    const fakeId = `sim_${leg.platform}_${Date.now().toString(36)}`;
    return {
      platform: leg.platform,
      tokenId: leg.tokenId,
      amount: leg.amount,
      expectedPrice: leg.expectedPrice,
      orderId: fakeId,
      simulated: true,
      error: reason ?? undefined,
    };
  }
}
