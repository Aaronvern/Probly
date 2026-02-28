"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getPrices, type MarketPrice } from "@/lib/api";

const MAX_HISTORY = 30; // ~60 seconds at 2s polling

export function usePrices(intervalMs = 2000) {
  const [markets, setMarkets] = useState<MarketPrice[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Accumulate price history per market (keyed by globalEventId)
  const historyRef = useRef<Map<string, number[]>>(new Map());
  const [priceHistory, setPriceHistory] = useState<Map<string, number[]>>(new Map());

  const fetch = useCallback(async () => {
    try {
      const data = await getPrices();
      setMarkets(data.markets);
      setUpdatedAt(data.updatedAt);
      setError(null);

      // Accumulate price history
      const map = historyRef.current;
      for (const m of data.markets) {
        if (m.yes.bestAsk !== null) {
          const arr = map.get(m.globalEventId) ?? [];
          arr.push(m.yes.bestAsk);
          if (arr.length > MAX_HISTORY) arr.shift();
          map.set(m.globalEventId, arr);
        }
      }
      setPriceHistory(new Map(map));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, intervalMs);
    return () => clearInterval(id);
  }, [fetch, intervalMs]);

  const arbMarkets = markets.filter((m) => m.hasArb);
  const wsMarkets = markets.filter((m) => m.dataSource === "ws").length;

  return { markets, arbMarkets, updatedAt, loading, error, wsMarkets, priceHistory };
}
