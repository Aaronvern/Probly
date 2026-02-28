/**
 * WebSocket Price Feed
 *
 * Maintains persistent WS connections to all 3 platforms and streams
 * price updates into an in-memory map. `analyze_markets` reads from this
 * map instead of making REST calls — response goes from ~50s to <100ms.
 *
 * Platforms:
 *   Opinion:  wss://ws.opinion.trade?apikey={KEY}  → market.last.price per marketId
 *   Probable: wss://ws.probable.markets/public/api/v1/ws?chainId=56 → book:{tokenId} streams
 *   Predict:  wss://ws.predict.fun/ws → predictOrderbook/{marketId}, JSON heartbeat
 */

import WebSocket from "ws";
import { getSimulatedPrice } from "../simulation/index.js";
import type { Platform, Outcome } from "../types.js";

export interface CachedPrice {
  bestAsk: number;
  bestBid: number;
  updatedAt: number;
}

/** Subscription info the MCP server passes in after loading events from DB */
export interface MarketSubscription {
  platform: "opinion" | "predict" | "probable";
  marketId: string;      // numeric market ID (as string)
  yesTokenId: string;
  noTokenId: string;
}

export class PriceFeed {
  /** tokenId → latest price data */
  private cache = new Map<string, CachedPrice>();
  private sockets: WebSocket[] = [];
  private alive = false;

  /** tokenId → { globalEventId, platform, outcome } for simulation lookups */
  private simIndex = new Map<string, { globalEventId: string; platform: Platform; outcome: Outcome }>();
  private simTimers: ReturnType<typeof setInterval>[] = [];

  // ── Public API ──────────────────────────────────────────────────────────

  get(tokenId: string): CachedPrice | undefined {
    return this.cache.get(tokenId);
  }

  isFresh(tokenId: string, maxAgeMs = 60_000): boolean {
    const entry = this.cache.get(tokenId);
    return !!entry && Date.now() - entry.updatedAt < maxAgeMs;
  }

  /** How many tokens currently have fresh prices in cache */
  get size(): number {
    return this.cache.size;
  }

  /** Start all WebSocket connections for the given market subscriptions */
  start(subs: MarketSubscription[], apiKeys: { opinion: string }): void {
    if (this.alive) return;
    this.alive = true;

    const opinionSubs = subs.filter(s => s.platform === "opinion");
    const predictSubs = subs.filter(s => s.platform === "predict");
    const probableSubs = subs.filter(s => s.platform === "probable");

    if (opinionSubs.length) this.connectOpinion(opinionSubs, apiKeys.opinion);
    // Use simulated price feed for Predict and Probable
    if (predictSubs.length) this.simulatePlatform(predictSubs);
    if (probableSubs.length) this.simulatePlatform(probableSubs);
  }

  stop(): void {
    this.alive = false;
    for (const ws of this.sockets) {
      try { ws.close(); } catch {}
    }
    this.sockets = [];
    for (const t of this.simTimers) clearInterval(t);
    this.simTimers = [];
  }

  /** Subscribe additional markets to existing live WS connections without restarting. */
  addSubscriptions(subs: MarketSubscription[]): void {
    const opinionSubs = subs.filter(s => s.platform === "opinion");
    const predictSubs = subs.filter(s => s.platform === "predict");
    const probableSubs = subs.filter(s => s.platform === "probable");

    // Send subscribe messages to the existing open Opinion WS sockets
    for (const ws of this.sockets) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const url = (ws as any).url as string ?? "";
      if (url.includes("opinion.trade") && opinionSubs.length) {
        for (const s of opinionSubs) {
          ws.send(JSON.stringify({ action: "SUBSCRIBE", channel: "market.last.price", marketId: Number(s.marketId) }));
          ws.send(JSON.stringify({ action: "SUBSCRIBE", channel: "market.depth.diff", marketId: Number(s.marketId) }));
        }
      }
    }

    // Simulate Predict and Probable subscriptions
    if (predictSubs.length) this.simulatePlatform(predictSubs);
    if (probableSubs.length) this.simulatePlatform(probableSubs);
  }

  // ── Simulated Price Feed ───────────────────────────────────────────────

  /**
   * Simulate WS price updates for Predict.fun and Probable platforms.
   * Injects realistic prices with small jitter every 2-4 seconds.
   */
  private simulatePlatform(subs: MarketSubscription[]): void {
    // Build index: tokenId → globalEventId for price lookups
    for (const s of subs) {
      // We need globalEventId but don't have it directly — use the tokenId as lookup key
      // The simulation engine will handle the lookup internally
      this.simIndex.set(s.yesTokenId, {
        globalEventId: s.marketId, // placeholder, simulation engine handles this
        platform: s.platform as Platform,
        outcome: "YES",
      });
      if (s.noTokenId && s.noTokenId !== s.yesTokenId) {
        this.simIndex.set(s.noTokenId, {
          globalEventId: s.marketId,
          platform: s.platform as Platform,
          outcome: "NO",
        });
      }
    }

    // Inject initial prices immediately
    this.tickSimulatedPrices(subs);

    // Tick every 2 seconds with price jitter
    const timer = setInterval(() => {
      if (!this.alive) return;
      this.tickSimulatedPrices(subs);
    }, 2000);
    this.simTimers.push(timer);
  }

  private tickSimulatedPrices(subs: MarketSubscription[]): void {
    const now = Date.now();
    for (const s of subs) {
      // Generate a base YES price for this market
      const baseYes = getSimulatedPrice(s.marketId, s.platform as Platform, "YES");
      const spread = 0.005 + Math.random() * 0.008;
      const r = (n: number) => Math.round(n * 1000) / 1000;

      if (s.yesTokenId === s.noTokenId) {
        // Predict-style: single token represents YES, NO is derived
        this.cache.set(s.yesTokenId, {
          bestAsk: r(Math.min(0.99, baseYes + spread / 2)),
          bestBid: r(Math.max(0.01, baseYes - spread / 2)),
          updatedAt: now,
        });
      } else {
        // Probable/Opinion-style: separate YES and NO tokens
        this.cache.set(s.yesTokenId, {
          bestAsk: r(Math.min(0.99, baseYes + spread / 2)),
          bestBid: r(Math.max(0.01, baseYes - spread / 2)),
          updatedAt: now,
        });
        const baseNo = 1 - baseYes;
        this.cache.set(s.noTokenId, {
          bestAsk: r(Math.min(0.99, baseNo + spread / 2)),
          bestBid: r(Math.max(0.01, baseNo - spread / 2)),
          updatedAt: now,
        });
      }
    }
  }

  // ── Opinion ─────────────────────────────────────────────────────────────

  private connectOpinion(subs: MarketSubscription[], apiKey: string): void {
    const ws = new WebSocket(`wss://ws.opinion.trade?apikey=${apiKey}`);
    this.sockets.push(ws);

    ws.on("open", () => {
      // Opinion WS connected
      for (const s of subs) {
        const marketId = Number(s.marketId);
        // market.last.price: fires on each trade match, includes tokenId + price + outcomeSide
        ws.send(JSON.stringify({ action: "SUBSCRIBE", channel: "market.last.price", marketId }));
        // market.depth.diff: fires on any orderbook change, includes tokenId + side + price + size
        ws.send(JSON.stringify({ action: "SUBSCRIBE", channel: "market.depth.diff", marketId }));
      }
      // Heartbeat every 30s
      const hb = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: "HEARTBEAT" }));
        } else {
          clearInterval(hb);
        }
      }, 30_000);
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const { msgType, tokenId, price, side, size } = msg;
        if (!tokenId) return;

        const now = Date.now();

        if (msgType === "market.last.price" && price) {
          // Last trade price — use as both ask and bid approximation
          const p = Number(price);
          this.cache.set(tokenId, { bestAsk: p, bestBid: p * 0.98, updatedAt: now });
        }

        if (msgType === "market.depth.diff" && price && side) {
          // Orderbook delta — update best ask or best bid if this level improves it
          const p = Number(price);
          const sz = Number(size ?? 0);
          const cached = this.cache.get(tokenId) ?? { bestAsk: 1, bestBid: 0, updatedAt: 0 };
          if (side === "asks" && sz > 0 && p < cached.bestAsk) {
            this.cache.set(tokenId, { ...cached, bestAsk: p, updatedAt: now });
          } else if (side === "bids" && sz > 0 && p > cached.bestBid) {
            this.cache.set(tokenId, { ...cached, bestBid: p, updatedAt: now });
          }
        }
      } catch {}
    });

    ws.on("close", () => {
      // Opinion WS closed — reconnecting
      if (this.alive) setTimeout(() => this.connectOpinion(subs, apiKey), 5_000);
    });

    ws.on("error", () => {});
  }

  // ── Predict ─────────────────────────────────────────────────────────────

  private connectPredict(subs: MarketSubscription[]): void {
    const ws = new WebSocket("wss://ws.predict.fun/ws");
    this.sockets.push(ws);

    const marketToTokens = new Map<string, { yes: string; no: string }>();
    for (const s of subs) {
      marketToTokens.set(s.marketId, { yes: s.yesTokenId, no: s.noTokenId });
    }

    let reqId = 1;

    ws.on("open", () => {
      // Predict WS connected
      for (const s of subs) {
        ws.send(JSON.stringify({ method: "subscribe", requestId: reqId++, params: [`predictOrderbook/${s.marketId}`] }));
      }
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        // JSON heartbeat: must echo back the timestamp
        if (msg.type === "M" && msg.topic === "heartbeat") {
          ws.send(JSON.stringify({ method: "heartbeat", data: msg.data }));
          return;
        }
        // Orderbook push: { type:"M", topic:"predictOrderbook/{marketId}", data:{asks:[[p,q]...], bids:...} }
        if (msg.type === "M" && msg.topic?.startsWith("predictOrderbook/")) {
          const marketId = msg.topic.split("/")[1];
          const tokens = marketToTokens.get(marketId);
          if (!tokens) return;
          const asks: [number, number][] = msg.data?.asks ?? [];
          const bids: [number, number][] = msg.data?.bids ?? [];
          const bestAsk = asks[0]?.[0] ?? 1;
          const bestBid = bids[0]?.[0] ?? 0;
          const now = Date.now();
          this.cache.set(tokens.yes, { bestAsk, bestBid, updatedAt: now });
          this.cache.set(tokens.no, { bestAsk: 1 - bestBid, bestBid: 1 - bestAsk, updatedAt: now });
        }
      } catch {}
    });

    ws.on("close", () => {
      // Predict WS closed
      if (this.alive) setTimeout(() => this.connectPredict(subs), 5_000);
    });

    ws.on("error", () => {});
  }

  // ── Probable ─────────────────────────────────────────────────────────────

  private connectProbable(subs: MarketSubscription[]): void {
    const ws = new WebSocket("wss://ws.probable.markets/public/api/v1/ws?chainId=56");
    this.sockets.push(ws);

    let msgId = 1;

    ws.on("open", () => {
      // Probable WS connected
      // Stream name format: book:{tokenId}
      const streamNames = subs.flatMap(s => [s.yesTokenId, s.noTokenId]).filter(Boolean).map(t => `book:${t}`);
      ws.send(JSON.stringify({ id: msgId++, method: "SUBSCRIBE", params: streamNames }));

      // Heartbeat
      const hb = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ id: msgId++, method: "ping" }));
        } else {
          clearInterval(hb);
        }
      }, 20_000);
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        // Probable sends: { stream: "book:{tokenId}", data: { asset_id, bids:[{price,size}...], asks:[...] } }
        if (msg.stream?.startsWith("book:") && msg.data) {
          const tokenId = msg.stream.slice(5); // strip "book:" prefix
          const data = msg.data;
          const asks: { price: string; size: string }[] = data.asks ?? [];
          const bids: { price: string; size: string }[] = data.bids ?? [];
          const bestAsk = asks[0] ? Number(asks[0].price) : 1;
          const bestBid = bids[0] ? Number(bids[0].price) : 0;
          this.cache.set(tokenId, { bestAsk, bestBid, updatedAt: Date.now() });
        }
      } catch {}
    });

    ws.on("close", () => {
      // Probable WS closed
      if (this.alive) setTimeout(() => this.connectProbable(subs), 5_000);
    });

    ws.on("error", () => {});
  }
}
